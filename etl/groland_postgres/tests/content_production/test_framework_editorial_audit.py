"""New editorial rules must not erase independent neighboring demonstrations."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import framework_editorial_audit as audit
from content_production.segment_suggestion_contract import build_prompt, PROMPT_V16, PROMPT_V17, DEFAULT_PROMPT_VERSION, PROMPT_V4
from content_production.segment_suggestion_provider import ProviderResult


def segment(a, b, label='live_demo'):
    return dict(start_ms=a, end_ms=b, label_key=label, confidence=.9, reason='measured review')


def proof(relation='subject_speech', opening='not_applicable', overlay='none'):
    value = dict(a_words='prior speech', b_words='actual speech', a_person='earlier presenter',
                 b_person='target presenter', evidence='actual voice and visual facts',
                 **{k:'no' for k in audit.FACTS})
    value['b_person_is_speaking']='yes' if relation=='subject_speech' else 'no'
    if opening != 'not_applicable':
        value.update(opening_link=opening,opening_evidence='shared opening narration',
                     opening_distinct_sources='yes' if opening=='montage_sequence' else 'no')
    if relation == 'external_voiceover':
        value.update(a_person_is_speaking='yes',b_person_is_speaking='no',same_voice='yes',same_person='no',
                     voice_check=dict(reference_words='actual A speech',target_words='actual B speech',
                                      reference_speakers='one',target_speakers='one',match='all',
                                      evidence='independent audio-only match'))
    return value


def planned(rows, duration, link='different_review'):
    # Pure decision fixtures; source interval construction is tested separately.
    return [dict(p,visual_link=link,speaker_reference=dict(start_ms=0,end_ms=1000))
            for p in audit.plan(rows,duration)]


class EditorialAuditTests(unittest.TestCase):
    def test_resolved_source_units_are_not_reclassified_or_charged_for_auxiliary_audio(self):
        rows = [segment(0, 12000, 'mixed_voiceover'), segment(12000, 22000),
                segment(22000, 34000), segment(34000, 60000)]
        reasons = ['adjacent_measured_reviews', 'resolved_review_operation', 'observed_composition']
        resolved = [dict(index=i, start_ms=rows[i]['start_ms'], end_ms=rows[i]['end_ms'], reason=reason)
                    for i, reason in zip(range(1, 4), reasons)]
        with patch.object(audit, 'run_probe') as probe, patch.object(audit, 'observe') as observe, \
                patch.object(audit, 'MAX_CHECKS', 0):
            result, receipt = audit.verify(rows, Path('unused'), 60000, Path('unused'), {},
                lambda: None, Mock(), windows=[], resolved=resolved)
        self.assertEqual(result, rows)
        self.assertEqual(receipt['compositionResolved'], resolved)
        self.assertEqual(receipt['audioMs'], 0)
        probe.assert_not_called(); observe.assert_not_called()

    def test_composition_authority_requires_exact_current_source_bounds(self):
        rows = [segment(0, 12000)]
        valid = dict(index=0, start_ms=0, end_ms=12000, reason='observed_composition')
        for values in ([dict(valid, end_ms=11999)], [dict(valid, index=True)],
                       [dict(valid, index=1)], [dict(valid, reason='model_guess')], [valid, valid]):
            with self.subTest(values=values), self.assertRaisesRegex(ValueError, 'source-bound'):
                audit.verify(rows, Path('unused'), 12000, Path('unused'), {}, lambda: None,
                             Mock(), windows=[], resolved=values)

    def test_partial_audio_is_observed_and_reported_without_whole_segment_veto(self):
        rows = [segment(0, 12000), segment(12000, 13000, 'mixed_voiceover'), segment(13000, 25000)]
        settled = [dict(index=0, start_ms=0, end_ms=12000, reason='observed_composition')]
        with patch.object(audit, 'run_probe', return_value='{"streams": [{"index": 1}]}'), \
                patch.object(audit.speaker, 'bind_reference', return_value={
                    'visual_link': 'different_review', 'speaker_reference': dict(start_ms=0, end_ms=1000)}), \
                patch.object(audit, 'observe', return_value=dict(proof('external_voiceover'),
                    voice_check=dict(reference_words='A', target_words='B', reference_speakers='one',
                                     target_speakers='one', match='part', evidence='conflicting voices'))) as observe:
            result, receipt = audit.verify(rows, Path('unused'), 25000, Path('unused'), {}, lambda: None,
                             Mock(), windows=[], resolved=settled)
            self.assertEqual(result, rows)
            self.assertEqual(receipt['audioConflicts'],[dict(start_ms=13000,end_ms=25000,
                match='part',resolution='external_narrator_not_established')])
        self.assertEqual(observe.call_args.args[1]['index'], 2)

    def test_opening_composition_absorbs_only_original_neighbor_not_later_reviews(self):
        rows = [segment(0, 4000, 'mixed_voiceover'), segment(4000, 16000),
                segment(16000, 33000, 'mixed_voiceover'), segment(33000, 46000), segment(46000, 58000)]
        plan = planned(rows, 58000)
        result, changes = audit.apply(rows, plan, [proof(opening='montage_sequence'), proof(), proof()])
        self.assertEqual([(s['start_ms'],s['end_ms'],s['label_key']) for s in result],
            [(0,33000,'mixed_voiceover'),(33000,46000,'live_demo'),(46000,58000,'live_demo')])
        self.assertEqual(changes[0]['rule'],'opening_composition')
        self.assertEqual(rows[1]['label_key'],'live_demo')  # Original source observation remains intact.

    def test_short_opening_is_not_permission_to_swallow_a_new_independent_review(self):
        rows = [segment(0,4000,'mixed_voiceover'),segment(4000,20000)]
        for link in ('new_review','self_intro'):
            result, changes = audit.apply(rows,planned(rows,20000),[proof(opening=link)])
            self.assertEqual(result, rows)
            self.assertEqual(changes,[])

    def test_verified_opening_composition_does_not_depend_on_voice_attribution(self):
        rows=[segment(0,6000,'mixed_voiceover'),segment(6000,18000)]
        items=planned(rows,18000)
        observed=proof('external_voiceover',opening='montage_sequence')
        observed['voice_check']['match']='part'
        self.assertFalse(audit.needs_voice_check(items[0],observed))
        result,changes=audit.apply(rows,items,[observed])
        self.assertEqual(result[0]['label_key'],'mixed_voiceover')
        self.assertEqual(result[0]['end_ms'],18000)
        self.assertEqual(changes[0]['rule'],'opening_composition')
        observed['opening_distinct_sources']='no'
        with self.assertRaisesRegex(ValueError,'independent source'):
            audit.apply(rows,items,[observed])

    def test_tiny_same_person_prefix_cannot_erase_the_whole_independent_opening(self):
        rows=[segment(0,6800,'mixed_voiceover'),segment(6800,17300)]
        item=planned(rows,17300,'same_review')[0]
        events=[dict(start_ms=a,end_ms=b,unit=u,kind=k) for a,b,u,k in [
            (0,3800,'','independent_insert'),(3800,6666,'P1','presenter'),
            (6666,17300,'P2','presenter')]]
        windows=[dict(start=0,end=17300,events=events)]
        item['opening_source_relation']=audit.opening_source_relation(item,windows)
        self.assertEqual(item['opening_source_relation'],'different_sources')
        result,_=audit.apply(rows,[item],[proof(opening='montage_sequence')])
        self.assertEqual(result[0]['end_ms'],17300)
        same=[dict(start_ms=0,end_ms=17300,unit='P2',kind='presenter')]
        self.assertEqual(audit.opening_source_relation(item,[dict(start=0,end=17300,events=same)]),'same_review')
        with self.assertRaisesRegex(ValueError,'Conflicting source opening'):
            audit.opening_source_relation(item,windows+[dict(start=0,end=17300,events=same)])
        self.assertIsNone(audit.opening_source_relation(item,[dict(start=2000,end=17300,events=events)]))

    def test_same_shoot_opening_cannot_be_relabelled_by_montage_wording(self):
        rows=[segment(0,1600,'mixed_voiceover'),segment(1600,31000)]
        for source in ('no','uncertain'):
            observed=dict(proof(opening='montage_sequence'),opening_distinct_sources=source)
            with self.assertRaisesRegex(ValueError,'independent source'):
                audit.apply(rows,planned(rows,31000),[observed])
        with self.assertRaisesRegex(ValueError,'independent source'):
            audit.apply(rows,planned(rows,31000,'same_review'),[proof(opening='montage_sequence')])

    def test_external_narrator_vetoes_duration_but_not_next_independent_speaker(self):
        rows=[segment(0,12000),segment(12000,13000,'mixed_voiceover'),segment(13000,27000)]
        result, changes=audit.apply(rows,planned(rows,27000),[proof('external_voiceover'),proof()])
        self.assertEqual([(s['start_ms'],s['end_ms'],s['label_key']) for s in result],
                         [(0,13000,'mixed_voiceover'),(13000,27000,'live_demo')])
        self.assertEqual(len(changes),1)

    def test_static_captions_and_personal_voiceover_do_not_trigger_montage(self):
        rows=[segment(0,12000)]
        for relation in ('subject_speech','own_voiceover','no_speech','unattributed_voiceover'):
            for overlay in ('static','none'):
                result, changes=audit.apply(rows,planned(rows,12000),[proof(relation,overlay=overlay)])
                self.assertEqual(result,rows)
                self.assertEqual(changes,[])

    def test_missing_uncertain_or_invalid_evidence_cannot_publish(self):
        rows=[segment(0,12000)]; plan=planned(rows,12000)
        for bad in ([],[None],[dict(proof(),evidence='')],[dict(proof(),same_voice=True)]):
            with self.subTest(bad=bad),self.assertRaises(ValueError):audit.apply(rows,plan,bad)
        rows=[segment(0,4000,'mixed_voiceover'),segment(4000,16000)]
        with self.assertRaises(ValueError):audit.apply(rows,planned(rows,16000),[proof()])

    def test_protected_categories_are_not_audio_reclassified(self):
        rows=[segment(0,15000,'street_interview'),segment(15000,25000,'promotion')]
        self.assertEqual(planned(rows,25000),[])
        self.assertEqual(audit.apply(rows,[],[]),(rows,[]))

    def test_long_candidate_gets_all_cores_with_context_and_budget_is_bounded(self):
        plan=planned([segment(0,100000)],100000)
        self.assertEqual([(p['start_ms'],p['end_ms']) for p in plan],[(0,36000),(36000,72000),(72000,100000)])
        self.assertTrue(all(p['context_end_ms']-p['context_start_ms']<=49000 for p in plan))
        with self.assertRaises(ValueError):planned([segment(0,1800000)],1800000)

    def test_partial_external_voice_cannot_downgrade_a_whole_long_review(self):
        rows=[segment(0,65000)]
        with self.assertRaisesRegex(ValueError,'Conflicting'):
            audit.apply(rows,planned(rows,65000),[proof('external_voiceover'),proof()])

    def test_continuous_voice_without_visible_speaking_anchor_does_not_veto(self):
        rows=[segment(0,12000)]
        for speaking in ('no','uncertain'):
            result,changes=audit.apply(rows,planned(rows,12000),[
                dict(proof('external_voiceover'),a_person_is_speaking=speaking)])
            self.assertEqual(result,rows)
            self.assertEqual(changes,[])

    def test_recording_change_and_same_voice_do_not_prove_borrowed_footage(self):
        rows=[segment(0,12000)]
        observed=dict(proof('external_voiceover'),same_person='yes',same_review='yes',b_person_is_speaking='yes')
        result,_=audit.apply(rows,planned(rows,12000),[observed])
        self.assertEqual(result,rows)
        # Conversely a verified multi-role review cannot be broken by voice alone.
        result,_=audit.apply(rows,planned(rows,12000,'same_review'),[observed])
        self.assertEqual(result,rows)

    def test_independent_audio_disagreement_preserves_primary_label_without_voice_veto(self):
        rows=[segment(0,12000)]
        for match in ('none','part','uncertain'):
            observed=proof('external_voiceover');observed['voice_check']['match']=match
            with self.subTest(match=match):
                self.assertEqual(audit.apply(rows,planned(rows,12000),[observed]),(rows,[]))
        observed=proof('external_voiceover');del observed['voice_check']
        with self.assertRaisesRegex(ValueError,'Unverified'):
            audit.apply(rows,planned(rows,12000),[observed])

    def test_identity_and_partial_speech_cannot_hide_voice_disagreement(self):
        rows=[segment(0,12000)]; plan=planned(rows,12000)
        # Reproduces 020: visual/audio observation claims the same person is
        # speaking, but an isolated audio check contradicts its same-voice claim.
        for protection in ({'same_person':'yes'},
                           {'same_person':'yes','b_person_is_speaking':'yes'}):
            observed=dict(proof('external_voiceover'),**protection)
            observed['voice_check']['match']='none'
            self.assertTrue(audit.needs_voice_check(plan[0],observed))
            with self.subTest(protection=protection):
                self.assertEqual(audit.apply(rows,plan,[observed]),(rows,[]))
            del observed['voice_check']
            with self.assertRaisesRegex(ValueError,'Unverified'):
                audit.apply(rows,plan,[observed])

    def test_separate_speakers_with_separate_voices_resolve_av_same_voice_guess(self):
        rows=[segment(0,12000)]; plan=planned(rows,12000)
        observed=dict(proof('external_voiceover'),b_person_is_speaking='yes',same_person='no')
        observed['voice_check']['match']='none'
        self.assertTrue(audit.needs_voice_check(plan[0],observed))
        self.assertEqual(audit.apply(rows,plan,[observed]),(rows,[]))
        del observed['voice_check']
        with self.assertRaisesRegex(ValueError,'Unverified'):
            audit.apply(rows,plan,[observed])

    def test_confirmed_own_speech_stays_live_after_independent_check(self):
        rows=[segment(0,12000)]
        observed=dict(proof('external_voiceover'),same_person='yes',b_person_is_speaking='yes')
        self.assertEqual(audit.apply(rows,planned(rows,12000),[observed]),(rows,[]))

    def test_voice_match_needs_one_reference_and_whole_target_coverage(self):
        rows=[segment(0,12000)]
        for key in ('reference_speakers','target_speakers'):
            observed=proof('external_voiceover');observed['voice_check'][key]='multiple'
            with self.assertRaisesRegex(ValueError,'coverage'):
                audit.apply(rows,planned(rows,12000),[observed])

    def test_two_claimed_on_camera_speakers_do_not_prove_one_external_voice(self):
        rows=[segment(0,12000)]
        observed=dict(proof('external_voiceover'),b_person_is_speaking='yes')
        result,changes=audit.apply(rows,planned(rows,12000),[observed])
        self.assertEqual((result,changes),(rows,[]))
        observed['b_person_is_speaking']='uncertain'
        with self.assertRaisesRegex(ValueError,'target speaking'):
            audit.apply(rows,planned(rows,12000),[observed])

    def test_own_intro_and_operations_cannot_be_wholly_downgraded_by_an_overlay(self):
        rows=[segment(0,14000)]
        observed=proof();observed.update(pip_is_speaking='yes',pip_matches_audio='yes',pip_is_other_person='yes')
        result,changes=audit.apply(rows,planned(rows,14000),[observed])
        self.assertEqual((result,changes),(rows,[]))

    def test_reference_is_exact_presenter_not_the_entire_preceding_context(self):
        item=dict(context_start_ms=6000,start_ms=10000,end_ms=20000)
        events=[dict(start_ms=6000,end_ms=7200,unit='A',kind='presenter'),
                dict(start_ms=7200,end_ms=10000,unit='',kind='independent_insert'),
                dict(start_ms=10000,end_ms=20000,unit='B',kind='presenter')]
        bound=audit.speaker.bind_reference(item,[dict(start=0,end=20000,events=events)])
        self.assertEqual(bound,dict(visual_link='different_review',
                                    speaker_reference=dict(start_ms=6000,end_ms=7200)))
        events[0]['end_ms']=6500
        self.assertIsNone(audit.speaker.bind_reference(item,[dict(start=0,end=20000,events=events)])['speaker_reference'])

    def test_no_visible_anchor_cannot_be_replaced_with_a_voice_guess(self):
        rows=[segment(0,12000)]
        plan=planned(rows,12000);plan[0]['speaker_reference']=None
        with self.assertRaisesRegex(ValueError,'Unverified'):
            audit.apply(rows,plan,[proof('external_voiceover')])

    def test_second_audio_request_is_budgeted_before_it_can_be_billed(self):
        rows=[segment(0,10000,'mixed_voiceover'),segment(10000,20000)]
        events=[dict(start_ms=6000,end_ms=9000,unit='A',kind='presenter'),
                dict(start_ms=9000,end_ms=10000,unit='',kind='independent_insert'),
                dict(start_ms=10000,end_ms=20000,unit='B',kind='presenter')]
        observed=proof('external_voiceover');del observed['voice_check']
        request=Mock(return_value=ProviderResult(observed,{'total_tokens':10},'av-first'))
        # 27s fits source A+B plus the first AV call, but not the extra 1s
        # separator actually sent to the provider. Both must stop before billing.
        for limit in (20000,27000):
            request.reset_mock()
            with tempfile.TemporaryDirectory() as folder,patch.object(audit,'MAX_AUDIO_MS',limit), \
                    patch.object(audit,'run_probe',return_value='{"streams":[{"index":1}]}'), \
                    patch.object(audit,'run_media',return_value=0):
                with self.subTest(limit=limit),self.assertRaisesRegex(ValueError,'budget exceeded'):
                    audit.verify(rows,Path('fixture.mp4'),20000,Path(folder),{},lambda:None,request,
                                 windows=[dict(start=0,end=20000,events=events)])
            self.assertEqual(request.call_count,1)

    def test_visual_units_are_compared_within_each_window_namespace(self):
        item=dict(context_start_ms=6000,start_ms=10000,end_ms=20000)
        def event(a,b,u):return dict(start_ms=a,end_ms=b,unit=u,kind='presenter')
        windows=[dict(start=0,end=20000,events=[event(0,10000,'P1'),event(10000,20000,'P2')]),
                 dict(start=5000,end=25000,events=[event(5000,10000,'P7'),event(10000,25000,'P8')])]
        self.assertEqual(audit.visual_link(item,windows),'different_review')
        windows[-1]['events'][-1]['unit']='P7'
        with self.assertRaisesRegex(ValueError,'Conflicting'):audit.visual_link(item,windows)

    def test_visual_prompt_remains_identical_and_default_does_not_change(self):
        labels=[dict(key=k,name=k,definition='legacy') for k in ('live_demo','mixed_voiceover')]
        self.assertEqual(build_prompt('framework',labels,PROMPT_V16),build_prompt('framework',labels,PROMPT_V17))
        self.assertEqual(DEFAULT_PROMPT_VERSION,PROMPT_V4)
