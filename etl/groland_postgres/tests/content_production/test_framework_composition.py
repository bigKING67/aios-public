"""Composition is independent of speaker identity and must preserve source cuts."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import framework_composition as composition
from content_production import framework_editorial_audit, framework_shot_verifier, framework_window_audit
from content_production.segment_suggestion_provider import ArkSegmentProvider, ProviderResult, SuggestionError


def segment(a, b, label='live_demo'):
    return dict(start_ms=a, end_ms=b, label_key=label, confidence=.9, reason='source measurement')


def answer(choice='assembled_support', **probabilities):
    probs = {k: .01 for k in composition.CRITERIA}
    probs[choice] = .97
    probs.update(probabilities)
    return dict(type='choice', choice=choice, confidence=.8, probabilities=probs)


def isolated():
    return [segment(0, 20000, 'mixed_voiceover'), segment(20000, 34000),
            segment(34000, 50000, 'mixed_voiceover')]


class CompositionTests(unittest.TestCase):
    def test_rounding_gap_cannot_bypass_composition_and_is_not_added_to_duration(self):
        rows = isolated()
        rows[1]['start_ms'] += 67
        targets, protected = composition.plan(rows, [], 50000)
        self.assertEqual(protected, [])
        self.assertEqual([t['start_ms'] for t in targets], [20067])
        for role, label in [('assembled_support', 'mixed_voiceover'), ('independent_review', 'live_demo')]:
            result, _ = composition.apply(rows, targets, {'q0': answer(role)})
            self.assertEqual(result[1]['label_key'], label)
            self.assertEqual(result[1]['start_ms'], 20067)

    def test_large_uncovered_gap_cannot_silently_leave_a_candidate_unaudited(self):
        rows = isolated()
        rows[1]['start_ms'] += 1000
        with self.assertRaisesRegex(ValueError, 'uncovered'):
            composition.plan(rows, [], 50000)

    def test_midfilm_composition_does_not_require_external_voice_or_rewrite_cuts(self):
        rows = isolated()
        targets, _ = composition.plan(rows, [], 50000)
        result, corrections = composition.apply(rows, targets, {'q0': answer()})
        self.assertEqual([s['label_key'] for s in result], ['mixed_voiceover']*3)
        self.assertEqual([(s['start_ms'], s['end_ms']) for s in result], [(0, 20000), (20000, 34000), (34000, 50000)])
        self.assertEqual(rows[1]['label_key'], 'live_demo')
        self.assertEqual(corrections[0]['rule'], 'neighboring_composition')

    def test_surrounding_mixed_is_not_itself_a_mixed_decision(self):
        rows = isolated()
        targets, _ = composition.plan(rows, [], 50000)
        for role in ('independent_review', 'own_review_step'):
            self.assertEqual(composition.apply(rows, targets, {'q0': answer(role)}), (rows, []))

    def test_independent_adjacent_reviews_and_person_boundary_are_preserved(self):
        rows = [segment(0, 12000, 'mixed_voiceover'), segment(12000, 22000),
                segment(22000, 34000), segment(34000, 45000, 'mixed_voiceover')]
        targets, protected = composition.plan(rows, [], 45000)
        self.assertEqual(targets, [])
        self.assertEqual([s['index'] for s in protected], [1, 2])
        self.assertEqual(composition.apply(rows, targets, {}), (rows, []))
        # Adjacency protects the measured people from a broad composition
        # classifier, but does not skip the independent speaker evidence.
        with patch.object(composition, 'run_media') as media:
            output, receipt=composition.verify(rows,Path('unused'),45000,Path('unused'),{},lambda:None,Mock(),windows=[])
        self.assertEqual(output,rows);self.assertEqual(receipt['settled'],[])
        media.assert_not_called()
        self.assertEqual(len(framework_editorial_audit.plan(rows,45000)),2)

    def test_followup_group_is_observed_not_automatically_demoted(self):
        rows = [segment(0, 60000), segment(60000, 63000, 'mixed_voiceover'),
                segment(63000, 75000), segment(75000, 87000), segment(87000, 99000),
                segment(99000, 110000, 'mixed_voiceover')]
        insert = dict(start_ms=60000, end_ms=63000, kind='independent_insert')
        windows = [dict(start=0, end=110000, events=[insert])]
        targets, protected = composition.plan(rows, windows, 110000)
        grouped = [t for t in targets if t.get('source_group')]
        self.assertEqual([t['index'] for t in grouped], [2, 3, 4])
        self.assertEqual(protected, [])
        # A middle member has no direct mixed neighbor but needs the same check.
        self.assertEqual(grouped[1]['source_group']['following_group'], [63, 99])
        answers = {f'q{i}': answer('independent_review') for i in range(len(targets))}
        self.assertEqual(composition.apply(rows, targets, answers), (rows, []))
        for question in composition.questions(grouped).values():
            self.assertIn('位置与长短关系本身不能定类', question['instructions'])

    def test_short_source_candidate_cannot_protect_itself_or_its_neighbor(self):
        rows = [segment(0,20000,'mixed_voiceover'),segment(20000,40000),
                segment(40000,48500),segment(48500,60000,'street_interview')]
        short = [dict(start_ms=40000,end_ms=48500)]
        targets,protected = composition.plan(rows,[],60000,short)
        self.assertEqual([t['index'] for t in targets],[1,2])
        self.assertEqual(protected,[])
        result,_ = composition.apply(rows,targets,{'q0':answer('assembled_support'),
                                                  'q1':answer('independent_review')})
        self.assertEqual([s['label_key'] for s in result],
                         ['mixed_voiceover','mixed_voiceover','live_demo','street_interview'])
        short_only = [segment(0,20000,'promotion'),segment(20000,28500),
                      segment(28500,40000,'street_interview')]
        self.assertEqual(len(composition.plan(short_only,[],40000,
            [dict(start_ms=20000,end_ms=28500)])[0]),1)

    def test_recovered_tolerance_keeps_the_ordinary_adjacent_review_contract(self):
        rows=[segment(0,10000,'mixed_voiceover'),segment(10000,19766),
              segment(19766,29133),segment(29133,60000)]
        measured=composition.plan(rows,[],60000)
        recovered=composition.plan(rows,[],60000,[dict(start_ms=10000,end_ms=19766)])
        self.assertEqual(recovered,measured)
        self.assertEqual(recovered[0],[])
        # Recovering a 9–10s source still does not protect an isolated quote
        # between montage units from the normal composition question.
        alone=[rows[0],rows[1],segment(19766,60000,'mixed_voiceover')]
        self.assertEqual([p['index'] for p in composition.plan(alone,[],60000,
            [dict(start_ms=10000,end_ms=19766)])[0]],[1])

    def test_short_exception_requires_reasoned_relation_even_with_high_probability(self):
        targets=[dict(index=1,start_ms=20000,end_ms=28500,narration_only=False)]
        fields=dict(index=0,role='assembled_support',target_action='产品演示',
                    left_relation='承接前一个对比论点',right_relation='继续同一对比',evidence='具体前后衔接')
        request=Mock(return_value=ProviderResult(dict(observations=[fields]),{},'proof'))
        result,proof=composition.clarify({'q0':answer('independent_review')},targets,
                                         Path('source.mp4'),request,required=[0])
        self.assertEqual(result,{0:'mixed_voiceover'})
        self.assertEqual(proof['responseId'],'proof')
        request.assert_called_once()

    def test_review_return_requires_relation_facts_before_a_confident_demotion(self):
        rows = isolated()
        recurrence = dict(insert=[34, 35], return_scene=[35, 38])
        for recurring, talking, role, choice in [(True, False, 'independent_review', 'assembled_support'),
                                                (True, False, 'assembled_support', 'assembled_support'),
                                                (True, True, 'independent_review', 'assembled_support'),
                                                (False, False, 'independent_review', 'assembled_support'),
                                                ('before', False, 'own_review_step', 'assembled_support'),
                                                (True, False, 'independent_review', 'independent_review')]:
            with self.subTest(recurring=recurring, talking=talking, role=role, choice=choice), \
                    tempfile.TemporaryDirectory() as folder:
                target = dict(index=1, start_ms=20000, end_ms=34000, narration_only=talking)
                if recurring:
                    target['source_recurrence'] = (dict(insert=[19, 20], return_scene=[16, 19])
                                                   if recurring == 'before' else recurrence)
                request = Mock(return_value=ProviderResult(dict(observations=[dict(index=0,
                    role=role, target_action='personal application and result comparison',
                    left_relation='previous content ends at a source change',
                    right_relation='packaging close followed by the same reviewer',
                    evidence='bound source actions and neighboring sequence')]), {}, 'facts'))
                def media(command, *_args):
                    Path(command[-1]).write_bytes(b'fixture')
                    return 0
                with patch.object(composition, 'plan', return_value=([target], [])), \
                        patch.object(composition, 'run_media', side_effect=media):
                    result, receipt = composition.verify(rows, Path('source'), 50000,
                        Path(folder), {}, lambda: None,
                        Mock(return_value=ProviderResult({'q0': answer(choice)}, {}, 'choice')),
                        windows=[], request=request)
                required = recurring is True and not talking and choice == 'assembled_support'
                self.assertEqual(request.call_count, int(required))
                expected = ('live_demo' if choice == 'independent_review' or
                            required and role == 'independent_review' else 'mixed_voiceover')
                self.assertEqual(result[1]['label_key'], expected)
                self.assertEqual((result[1]['start_ms'], result[1]['end_ms']), (20000, 34000))
                self.assertEqual(bool(receipt['clarification']), required)

    def test_adjacent_reviews_without_bounded_source_group_stay_protected(self):
        rows = [segment(0, 60000), segment(60000, 63000, 'mixed_voiceover'),
                segment(63000, 75000), segment(75000, 87000),
                segment(87000, 100000, 'mixed_voiceover')]
        insert = dict(start_ms=60000, end_ms=63000, kind='independent_insert')
        cases = [(rows, []), (rows[:-1], [insert]),
                 (rows, [dict(insert, kind='own_detail')]),
                 (rows, [dict(insert, intro_unit='review')]),
                 (rows, [dict(insert, outro_unit='review')]),
                 ([dict(rows[0], start_ms=45000), *rows[1:]], [insert]),
                 ([*rows[:3], dict(rows[3], start_ms=76000), rows[4]], [insert])]
        for segments, events in cases:
            with self.subTest(segments=segments, events=events):
                self.assertEqual(composition.followup_groups(segments, [dict(events=events)]), {})

    def test_shorter_adjacent_review_is_not_demoted_by_relative_length(self):
        rows = [segment(0, 60000), segment(60000, 79000),
                segment(79000, 87000, 'street_interview')]
        targets, protected = composition.plan(rows, [], 87000)
        self.assertEqual(targets, [])
        self.assertEqual([p['index'] for p in protected], [0, 1])
        self.assertEqual(composition.apply(rows, targets, {}), (rows, []))

    def test_bounded_trailing_excerpt_only_selects_observation(self):
        rows = [segment(0,60000),segment(60000,71000),segment(71000,80000,'mixed_voiceover')]
        targets,_ = composition.plan(rows,[],80000)
        self.assertEqual([t['index'] for t in targets],[1])
        self.assertEqual(composition.apply(rows,targets,{'q0':answer('independent_review')}),(rows,[]))
        self.assertEqual(composition.apply(rows,targets,{'q0':answer('assembled_support')})[0][1]['label_key'],'mixed_voiceover')
        # Similar length independent reviews are not selected by this trigger.
        equal = [dict(rows[0], start_ms=48000), *rows[1:]]
        self.assertEqual(composition.plan(equal, [], 80000)[0], [])
        # A short fragment inherited from a longer measured core is not a new
        # standalone source; a window boundary must not trigger this question.
        short = [rows[0], dict(rows[1], end_ms=68000), dict(rows[2], start_ms=68000)]
        self.assertEqual(composition.plan(short, [], 80000)[0], [])

    def test_resolved_operation_bridge_is_scoped_to_complete_window(self):
        events = [dict(start_ms=a, end_ms=b, unit='review', needs_ownership=False, kind=kind,
                       person=person, action=action) for a, b, kind, person, action in [
            (20000, 24000, 'presenter', 'P1', 'talking_demo'),
            (24000, 27000, 'own_detail', '', 'hand_operation'),
            (27000, 34000, 'presenter', 'P2', 'personal_application')]]
        window = dict(start=0, end=50000, events=events)
        targets, protected = composition.plan(isolated(), [window], 50000)
        self.assertEqual(targets, [])
        self.assertEqual(protected[0]['reason'], 'resolved_review_operation')
        for altered in [dict(window, end=33000), dict(window, events=[events[0], events[2]]),
                        dict(window, events=[events[0], dict(events[1], unit='other'), events[2]]),
                        dict(window, events=[events[0], dict(events[1], needs_ownership=True), events[2]]),
                        dict(window, events=[events[0], dict(events[1], kind='independent_insert'), events[2]])]:
            self.assertEqual(len(composition.plan(isolated(), [altered], 50000)[0]), 1)
        # Matching IDs from two partial windows do not constitute one proof.
        self.assertIsNone(composition.review_bridge(isolated()[1], [
            dict(start=0, end=27000, events=events[:2]), dict(start=24000, end=50000, events=events[1:])]))

    def test_street_interview_and_promotion_do_not_select_candidates(self):
        rows = [segment(0, 10000, 'street_interview'), segment(10000, 24000), segment(24000, 40000, 'promotion')]
        self.assertEqual(composition.plan(rows, [], 40000)[0], [])

    def test_invalid_missing_uncertain_or_stale_answers_cannot_apply(self):
        rows = isolated(); targets, _ = composition.plan(rows, [], 50000)
        bad = [None, {}, {'q1': answer()}, {'q0': answer('uncertain')},
               {'q0': dict(answer(), confidence=float('nan'))},
               {'q0': answer(assembled_support=.2)}, {'q0': dict(answer(), choice='unknown')},
               {'q0': answer(assembled_support=True)}]
        for value in bad:
            with self.subTest(value=value), self.assertRaises(ValueError):
                composition.apply(rows, targets, value)
        with self.assertRaisesRegex(ValueError, 'Stale'):
            composition.apply(rows, [dict(targets[0], start_ms=21000)], {'q0': answer()})

    def test_review_roles_are_aggregated_before_business_classification(self):
        # A four-way argmax is not necessarily the two-way business winner.
        value = answer(independent_review=.3, own_review_step=.3, assembled_support=.39, uncertain=.01)
        self.assertEqual(composition.labels({'q0': value}, 1), ['live_demo'])
        value = answer(independent_review=.2, own_review_step=.2, assembled_support=.4, uncertain=.2)
        with self.assertRaisesRegex(ValueError, 'Unresolved'):
            composition.labels({'q0': value}, 1)

    def test_ambiguous_live_vote_also_needs_contextual_facts(self):
        close=answer('independent_review',independent_review=.59,own_review_step=.01,
                     assembled_support=.39,uncertain=.01)
        request=Mock(return_value=ProviderResult(dict(observations=[dict(index=0,
            target_action='person applying product',left_relation='continues shared demonstration',
            right_relation='another source continues the claim',evidence='visible sequence',
            role='assembled_support')]),{},'id'))
        result,_=composition.clarify({'q0':close},[dict(start_ms=10000,end_ms=22000)],Path('video'),request)
        self.assertEqual(result,{0:'mixed_voiceover'})
        composition.clarify({'q0':close}, [dict(start_ms=10000,end_ms=22000)],
            Path('video'),request,context='measured source witness: separate recording at 19s')
        self.assertIn('measured source witness: separate recording at 19s', request.call_args.args[0])
        strong=answer('assembled_support')
        strong['confidence']=.7
        request.reset_mock()
        self.assertEqual(composition.clarify({'q0':strong},[dict(start_ms=10000,end_ms=22000)],Path('video'),request),({},None))
        request.assert_not_called()

    def test_budget_rejects_before_model_and_never_slices_candidate_list(self):
        with self.assertRaisesRegex(ValueError, 'budget'):
            composition.plan(isolated(), [], composition.MAX_VIDEO_MS+1)
        self.assertEqual(composition.plan([segment(0, 500000)], [], 500000)[0], [])

    def test_questions_do_not_include_previous_labels_or_duration_as_independence(self):
        targets, _ = composition.plan(isolated(), [], 50000)
        question = composition.questions(targets)['q0']
        self.assertIn('20.000–34.000', question['instructions'])
        self.assertIn('单块可以超过10秒', question['criteria']['assembled_support'])
        self.assertNotIn('label_key', json.dumps(question))

    def test_observations_preserve_source_positions_and_local_ids_without_business_labels(self):
        windows = [dict(start=0, end=50000, events=[dict(start_ms=20000, end_ms=34000,
            unit='U1', person='P1', kind='presenter', action='personal_application',
            visible='person', appearance='white shirt', label_key='must-not-be-forwarded')])]
        context = composition.source_context(windows)
        self.assertIn('局部命名空间', context)
        self.assertNotIn('must-not-be-forwarded', context)
        data = json.loads(context.split('\n', 1)[1])
        self.assertEqual(data[0]['events'][0]['start_sec'], 20)
        self.assertEqual(data[0]['events'][0]['unit'], 'U1')
        with patch.object(composition, 'MAX_CONTEXT_BYTES', 1), self.assertRaises(ValueError):
            composition.source_context(windows)

    def test_host_instruction_requires_complete_agreeing_talking_only_observations(self):
        event = dict(start_ms=20000, end_ms=34000, unit='U1', kind='presenter',
                     person='P1', action='talking_demo', needs_ownership=False)
        window = dict(start=0, end=50000, events=[event])
        targets, _ = composition.plan(isolated(), [window], 50000)
        self.assertTrue(targets[0]['narration_only'])
        self.assertIn('纯出镜讲解', composition.questions(targets)['q0']['instructions'])
        for windows in ([], [dict(window, end=30000)],
                        [dict(window, events=[dict(event, action='personal_application')])],
                        [window, dict(window, events=[dict(event, action='personal_application')])]):
            targets, _ = composition.plan(isolated(), windows, 50000)
            self.assertFalse(targets[0]['narration_only'])
            self.assertNotIn('纯出镜讲解', composition.questions(targets)['q0']['instructions'])


class CompositionProviderTests(unittest.TestCase):
    def provider(self, payload=None, status=200):
        provider = object.__new__(ArkSegmentProvider)
        provider.model = 'doubao-seed-2-1-lite-260915'
        provider.config = SimpleNamespace(base_url='https://ark.cn-beijing.volces.com/api/v3/responses',
                                         api_key='fixture-only', timeout_seconds=30)
        provider.client = Mock()
        provider.client.session.post.return_value = Mock(status_code=status)
        provider.client.session.post.return_value.json.return_value = payload or dict(
            model=provider.model, answers={'q0': answer()}, usage={'input_tokens': 12, 'output_tokens': 0})
        return provider

    def test_beta_wire_uses_same_model_ordinary_credential_and_explicit_fps(self):
        provider = self.provider()
        result = provider.decide({'q0': {'type': 'choice'}}, proxy=Path(__file__), context='source facts')
        call = provider.client.session.post.call_args
        self.assertEqual(call.args[0], 'https://ark.cn-beijing.volces.com/api/v1/systemone')
        self.assertEqual(call.kwargs['headers']['ark-beta-systemone-api'], 'true')
        body = json.loads(call.kwargs['data'])
        self.assertEqual(body['model'], provider.model)
        self.assertEqual(body['state'][0]['fps'], 2)
        self.assertEqual(body['state'][1], {'type': 'text', 'text': 'source facts'})
        self.assertEqual(result.usage, {'input_tokens': 12, 'output_tokens': 0, 'total_tokens': 12})
        provider.client.session.post.assert_called_once()

    def test_no_coding_plan_routing_or_alternate_model_fallback(self):
        for endpoint, model in [('https://ark.cn-beijing.volces.com/api/coding/v3', 'doubao-seed-2-1-lite-260915'),
                                ('https://ark.cn-beijing.volces.com/api/v3/responses', 'another-model')]:
            provider = self.provider(); provider.config.base_url = endpoint; provider.model = model
            with self.assertRaises(SuggestionError): provider.decide({}, proxy=Path(__file__))
            provider.client.session.post.assert_not_called()

    def test_failure_keeps_usage_without_returning_provider_diagnostics_or_retrying(self):
        provider = self.provider({'error': {'message': 'sensitive diagnostic'}, 'usage': {'input_tokens': 7}}, 403)
        with self.assertRaises(SuggestionError) as caught:
            provider.decide({}, proxy=Path(__file__))
        self.assertEqual(caught.exception.usage, {'input_tokens': 7})
        self.assertNotIn('sensitive', str(caught.exception))
        provider.client.session.post.assert_called_once()


class CompositionOrderTests(unittest.TestCase):
    def test_composition_resolves_before_audio_and_usage_is_accounted_on_rejection(self):
        rows = isolated()
        payload = {'segments': [dict(start_sec=s['start_ms']/1000, end_sec=s['end_ms']/1000,
                    label_key=s['label_key'], confidence=.9, reason='measured', same_person_as_previous=False) for s in rows]}
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            def media(command, *_args):
                Path(command[-1]).write_bytes(b'fixture'); return 0
            with patch.object(framework_window_audit, 'verify', return_value=(payload, {'windows': [], 'liveClaims': []})), \
                    patch.object(composition, 'run_media', side_effect=media), \
                    patch.object(framework_editorial_audit, 'verify', side_effect=lambda s, *a, **k: (s, {})) as audio:
                provider = Mock(); usage = Mock()
                provider.review.return_value = ProviderResult({'observations':[dict(index=0,role='assembled_support',
                    target_action='borrowed application',left_relation='host introduction',right_relation='same quotation',evidence='concrete flow')]},
                    {'input_tokens':20},'facts')
                provider.decide.return_value = ProviderResult({'q0': answer()}, {'input_tokens': 10}, 'decision')
                result, receipt = framework_shot_verifier.verify_continuity(payload, work/'source.mp4', 50000,
                    {'live_demo', 'mixed_voiceover'}, work, {}, lambda: None, provider, 30, usage, editorial=True)
                self.assertTrue(all(s['label_key'] == 'mixed_voiceover' for s in audio.call_args.args[0]))
                self.assertEqual(receipt['composition']['corrections'][0]['index'], 1)
                self.assertEqual(audio.call_args.kwargs['resolved'],
                                 [dict(receipt['composition']['targets'][0], reason='observed_composition')])
                usage.assert_called_once_with({'input_tokens':10})
                provider.decide.return_value = ProviderResult({'q0': answer('independent_review')}, {}, 'keep-candidate')
                _, kept = framework_shot_verifier.verify_continuity(payload, work/'source.mp4', 50000,
                    {'live_demo', 'mixed_voiceover'}, work, {}, lambda: None, provider, 30, usage, editorial=True)
                self.assertEqual(kept['composition']['settled'], [])
                self.assertEqual(audio.call_args.kwargs['resolved'], [])
                audio.reset_mock(); usage.reset_mock()
                provider.decide.return_value = ProviderResult({}, {'input_tokens': 17}, 'rejected')
                with self.assertRaisesRegex(ValueError, 'Incomplete composition'):
                    framework_shot_verifier.verify_continuity(payload, work/'source.mp4', 50000,
                        {'live_demo', 'mixed_voiceover'}, work, {}, lambda: None, provider, 30, usage, editorial=True)
                audio.assert_not_called(); usage.assert_called_once_with({'input_tokens': 17})


if __name__ == '__main__':
    unittest.main()
