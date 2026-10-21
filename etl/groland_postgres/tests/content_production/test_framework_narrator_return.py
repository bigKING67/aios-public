import copy
import unittest

from content_production import framework_narrator_return as module


def voice(match):
    return dict(reference_words='前面原话', target_words='后面原话', evidence='实际声线比较',
                match=match, reference_speakers='one', target_speakers='one')


def segments():
    return [dict(start_ms=a, end_ms=b, label_key=label, reason='existing', confidence=.9)
            for a, b, label in [(0, 30000, 'mixed_voiceover'), (30000, 42000, 'live_demo'),
                                (42000, 55000, 'live_demo'), (55000, 70000, 'street_interview')]]


def editorial():
    return dict(observations=[
        dict(start_ms=30000, end_ms=42000, proof=dict(b_person_is_speaking='yes')),
        dict(start_ms=42000, end_ms=55000, visual_link='different_review',
             proof=dict(a_person_is_speaking='yes', b_person_is_speaking='no', voice_check=voice('none')))])


def evidence(target, **changes):
    context = dict(a_content='前段叙述', b_content='本人原声推荐', c_content='其他录制展示',
                   evidence='外部旁白在原声推荐后恢复，无本人操作衔接', b_is_speaking='yes',
                   c_is_speaking='no', own_review_flow='no', external_narrator_return='yes',
                   group_role='assembled_quote')
    context.update(changes)
    return dict(target, audio=dict(a_c=voice('all'), a_b=voice('none')), context=context)


class NarratorReturnTests(unittest.TestCase):
    def test_only_full_bound_disagreement_selects_group(self):
        target = module.plan(segments(), editorial(), [])[0]
        self.assertEqual(target['indices'], [1, 2])
        self.assertEqual(target['ranges'][0], dict(start_ms=22000, end_ms=30000))
        for change in ('short_observation', 'speaking', 'same_recording', 'no_voice_check'):
            e = editorial()
            q = e['observations'][1]
            if change == 'short_observation':
                q['end_ms'] -= 1000
            elif change == 'speaking':
                q['proof']['b_person_is_speaking'] = 'yes'
            elif change == 'same_recording':
                q['visual_link'] = 'same_review'
            else:
                q['proof'].pop('voice_check')
            self.assertEqual(module.plan(segments(), e, []), [], change)

    def test_positive_three_source_evidence_changes_labels_only(self):
        s = segments()
        targets = module.plan(s, editorial(), [])
        output, changes, unresolved = module.apply(s, targets, [evidence(targets[0])])
        self.assertEqual([x['label_key'] for x in output[:3]], ['mixed_voiceover']*3)
        self.assertEqual([(x['start_ms'], x['end_ms']) for x in output],
                         [(x['start_ms'], x['end_ms']) for x in s])
        self.assertEqual(s[1]['label_key'], 'live_demo')
        self.assertEqual(len(changes), 1)
        self.assertEqual(unresolved, [])

    def test_voice_return_without_quotation_or_own_flow_does_not_relabel(self):
        s = segments()
        targets = module.plan(s, editorial(), [])
        for changes in [dict(group_role='own_review'), dict(group_role='independent_reviews'),
                        dict(own_review_flow='yes'), dict(c_is_speaking='yes'),
                        dict(external_narrator_return='uncertain'), dict(group_role='uncertain')]:
            output, corrections, _ = module.apply(s, targets, [evidence(targets[0], **changes)])
            self.assertEqual(output, s, changes)
            self.assertEqual(corrections, [])

    def test_same_reviewer_voice_and_unknown_audio_are_not_a_quote(self):
        s = segments()
        targets = module.plan(s, editorial(), [])
        for key, match in [('a_b', 'all'), ('a_b', 'part'), ('a_c', 'part'), ('a_c', 'uncertain')]:
            proof = evidence(targets[0])
            proof['audio'][key] = voice(match)
            output, corrections, _ = module.apply(s, targets, [proof])
            self.assertEqual(output, s)
            self.assertEqual(corrections, [])

    def test_missing_comparison_or_malformed_context_rejects(self):
        s = segments()
        targets = module.plan(s, editorial(), [])
        for field in ('comparison', 'context'):
            proof = evidence(targets[0])
            if field == 'comparison':
                proof['audio'].pop('a_b')
            else:
                proof['context'].pop('evidence')
            with self.assertRaises(ValueError):
                module.apply(s, targets, [proof])

    def test_wrong_binding_and_stale_timing_reject(self):
        s = segments()
        targets = module.plan(s, editorial(), [])
        proof = copy.deepcopy(evidence(targets[0]))
        proof['ranges'][1]['start_ms'] += 1
        with self.assertRaises(ValueError):
            module.apply(s, targets, [proof])
        s[1]['end_ms'] -= 1
        with self.assertRaises(ValueError):
            module.apply(s, targets, [evidence(targets[0])])

    def test_no_question_from_time_adjacency_or_gaps_alone(self):
        s = segments()
        self.assertEqual(module.plan(s, {}, []), [])
        s[1]['start_ms'] += 1
        self.assertEqual(module.plan(s, editorial(), []), [])

    def test_rejected_pattern_does_not_require_context(self):
        s = segments()
        targets = module.plan(s, editorial(), [])
        proof = dict(targets[0], audio=dict(a_c=voice('none')), context=None)
        self.assertEqual(module.apply(s, targets, [proof])[0], s)

    def test_multiple_voice_quote_still_needs_independent_context(self):
        targets = module.plan(segments(), editorial(), [])
        proof = evidence(targets[0], group_role='own_review')
        proof['audio']['a_b'] = dict(voice('part'), target_speakers='multiple')
        self.assertTrue(module.audio_pattern(proof['audio']))
        self.assertEqual(module.apply(segments(), targets, [proof])[0], segments())
        proof['context'].update(group_role='assembled_quote')
        self.assertEqual(len(module.apply(segments(), targets, [proof])[1]), 1)


class NarratorConflictResolutionTests(unittest.TestCase):
    def fixture(self):
        rows=segments();target=module.plan(rows,editorial(),[])[0];proof=evidence(target)
        result,changes,_=module.apply(rows,[target],[proof])
        warning=dict(start_ms=42000,end_ms=55000,match='none',resolution='external_narrator_not_established')
        report=dict(audioConflicts=[warning],observations=[{'retained':'raw AV evidence'}])
        return result,report,dict(corrections=changes,observations=[proof])

    def test_later_three_source_proof_closes_prior_pair_hypothesis_without_erasing_raw(self):
        rows,report,receipt=self.fixture();resolved=module.resolve_editorial_conflicts(rows,report,receipt)
        self.assertEqual(resolved['audioConflicts'],[])
        self.assertEqual(resolved['audioResolutions'][0]['resolution'],'source_bound_narrator_return')
        self.assertEqual(resolved['observations'],report['observations'])
        self.assertEqual(len(report['audioConflicts']),1)

    def test_stale_wrong_scope_or_unconfirmed_audio_cannot_close_warning(self):
        for change in ['no_correction','no_observation','different_scope','partial_audio','own_review','outside_C','missing_coverage','restored_live']:
            rows,report,receipt=self.fixture()
            if change=='no_correction':receipt['corrections']=[]
            if change=='no_observation':receipt['observations']=[]
            if change=='different_scope':receipt['observations']=copy.deepcopy(receipt['observations']);receipt['observations'][0]['ranges'][2]['start_ms']+=1
            if change=='partial_audio':receipt['observations'][0]['audio']['a_c']=voice('part')
            if change=='own_review':receipt['observations'][0]['context']['own_review_flow']='yes'
            if change=='outside_C':report['audioConflicts'][0]['start_ms']=41000
            if change=='missing_coverage':rows[2]['start_ms']+=1
            if change=='restored_live':rows[2]['label_key']='live_demo'
            with self.subTest(change=change):
                self.assertEqual(module.resolve_editorial_conflicts(rows,report,receipt)['audioConflicts'],report['audioConflicts'])


if __name__ == '__main__':
    unittest.main()
