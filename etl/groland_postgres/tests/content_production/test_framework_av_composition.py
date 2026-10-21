import copy
import unittest

from content_production import framework_av_composition as module


def fixture():
    segments = [dict(start_ms=a, end_ms=b, label_key=label, confidence=.9, reason='original')
                for a, b, label in [(0, 90000, 'live_demo'), (90000, 106000, 'live_demo'),
                                    (106000, 125000, 'mixed_voiceover')]]
    editorial = dict(observations=[dict(start_ms=90000, end_ms=106000, visual_link='different_review',
        proof=dict(a_person_is_speaking='yes', b_person_is_speaking='no', same_review='no'))])
    windows = [dict(start=90000, end=125000, events=[dict(start_ms=90000, end_ms=106000,
        unit='U2', person='P2', kind='presenter', action='personal_application')])]
    claims = [dict(start_ms=0, end_ms=90000, minimum=10001)]
    return segments, editorial, windows, claims


def proof(target, role):
    return dict(target, payload=dict(target_action='拍粉后展示皮肤', left_relation='前面结束自己的测试',
        right_relation='接入不同来源试用画面配同一段叙述', evidence='实际左右衔接与各自操作', role=role,
        **(dict(target_audio='spoken_narration', narration_relation='adjacent_narration')
           if target.get('isolated_narrated_recording') else {})))


class AVCompositionTests(unittest.TestCase):
    def test_short_exception_is_checked_before_offer_neighbors_hide_narration(self):
        args=fixture()
        args[0][0]['label_key']='promotion'
        args[0][1]['end_ms']=args[0][2]['start_ms']=98500
        args[1]['observations'][0].update(end_ms=98500,visual_link='unavailable')
        args[1]['observations'][0]['proof'].update(a_person_is_speaking='uncertain',same_review='uncertain')
        short=[dict(start_ms=90000,end_ms=98500)]
        self.assertEqual(module.plan(*args),[])
        targets=module.plan(*args,short_reviews=short,only_short=True)
        self.assertEqual(len(targets),1)
        self.assertTrue(targets[0]['isolated_narrated_recording'])
        result,changes,_=module.apply(args[0],targets,[proof(targets[0],'assembled_support')])
        self.assertEqual(result[1]['label_key'],'mixed_voiceover')
        self.assertEqual(len(changes),1)
        self.assertEqual(module.plan(*fixture(),only_short=True),[])
        args[1]['observations'][0]['proof']['b_person_is_speaking']='yes'
        self.assertEqual(module.plan(*args,short_reviews=short,only_short=True),[])

    def test_music_and_silence_cannot_supply_narration_evidence(self):
        args = fixture()
        args[0][0]['label_key'] = 'mixed_voiceover'
        targets = module.plan(*args)
        for audio, relation in [('music_only','not_applicable'), ('silence','not_applicable'),
                                ('spoken_narration','own_review')]:
            p = proof(targets[0], 'assembled_support')
            p['payload'].update(target_audio=audio, narration_relation=relation)
            result, corrections, unresolved = module.apply(args[0], targets, [p])
            self.assertEqual(result, args[0])
            self.assertEqual((corrections, unresolved), ([], []))

    def test_rejected_short_candidate_cannot_fragment_the_next_offer_question(self):
        rows=[dict(start_ms=a,end_ms=b,label_key=label) for a,b,label in [
            (0,30000,'promotion'),(30000,40000,'mixed_voiceover'),(40000,48500,'mixed_voiceover'),
            (48500,60000,'mixed_voiceover'),(60000,80000,'live_demo'),(80000,100000,'live_demo'),
            (100000,110000,'mixed_voiceover'),(110100,120000,'mixed_voiceover')]]
        result=module.coalesce_mixed(rows)
        self.assertEqual([(s['start_ms'],s['end_ms']) for s in result],
                         [(0,30000),(30000,60000),(60000,80000),(80000,100000),
                          (100000,110000),(110100,120000)])
        self.assertEqual(rows[1]['end_ms'],40000)

    def test_isolated_narrated_candidate_gets_context_check_despite_rounding_gap(self):
        args = fixture()
        args[0][0].update(label_key='mixed_voiceover', end_ms=89933)
        args[1]['observations'][0].update(visual_link='same_review')
        args[1]['observations'][0]['proof'].update(a_person_is_speaking='uncertain', same_review='uncertain')
        targets = module.plan(*args)
        self.assertTrue(targets[0]['isolated_narrated_recording'])
        # Triggering a question must not itself demote an independently dubbed review.
        output, changes, _ = module.apply(args[0], targets, [proof(targets[0], 'independent_review')])
        self.assertEqual(output, args[0])
        self.assertEqual(changes, [])
        args[1]['observations'][0]['proof']['b_person_is_speaking'] = 'uncertain'
        self.assertEqual(module.plan(*args), [])

    def test_only_source_bound_audio_disagreement_selects_target(self):
        args = fixture()
        target = module.plan(*args)[0]
        self.assertEqual((target['context_start_ms'], target['context_end_ms']), (58000, 125000))
        for field, value in [('b_person_is_speaking', 'yes'), ('b_person_is_speaking', 'uncertain'),
                             ('a_person_is_speaking', 'no'), ('same_review', 'yes')]:
            modified = copy.deepcopy(args)
            modified[1]['observations'][0]['proof'][field] = value
            self.assertEqual(module.plan(*modified), [])

    def test_no_inference_from_duration_or_silence_without_source_evidence(self):
        for alteration in ('no_core', 'partial_observation', 'unknown_source', 'no_action', 'gap'):
            args = fixture()
            if alteration == 'no_core': args[3].clear()
            if alteration == 'partial_observation': args[1]['observations'][0]['end_ms'] -= 1
            if alteration == 'unknown_source': args[1]['observations'][0]['visual_link'] = 'unavailable'
            if alteration == 'no_action': args[2][0]['events'][0]['action'] = 'talking_demo'
            if alteration == 'gap': args[0][2]['start_ms'] += 1
            self.assertEqual(module.plan(*args), [], alteration)

    def test_own_review_and_independent_silent_demonstration_are_preserved(self):
        args = fixture()
        targets = module.plan(*args)
        for role in ('own_review_step', 'independent_review', 'uncertain'):
            result, changes, unresolved = module.apply(args[0], targets, [proof(targets[0], role)])
            self.assertEqual(result, args[0])
            self.assertEqual(changes, [])
            self.assertEqual(bool(unresolved), role == 'uncertain')

    def test_positive_context_changes_only_target_label(self):
        args = fixture()
        targets = module.plan(*args)
        result, changes, unresolved = module.apply(args[0], targets, [proof(targets[0], 'assembled_support')])
        self.assertEqual(result[1]['label_key'], 'mixed_voiceover')
        self.assertEqual(args[0][1]['label_key'], 'live_demo')
        self.assertEqual([(s['start_ms'], s['end_ms']) for s in result],
                         [(s['start_ms'], s['end_ms']) for s in args[0]])
        self.assertEqual(result[0], args[0][0])
        self.assertEqual(result[2], args[0][2])
        self.assertEqual(len(changes), 1)
        self.assertEqual(unresolved, [])

    def test_missing_stale_and_misbound_evidence_rejects(self):
        args = fixture()
        targets = module.plan(*args)
        with self.assertRaises(ValueError): module.apply(args[0], targets, [])
        for alteration in ('wrong_target', 'empty_evidence', 'stale'):
            s = copy.deepcopy(args[0])
            p = proof(targets[0], 'assembled_support')
            if alteration == 'wrong_target': p['start_ms'] += 1
            if alteration == 'empty_evidence': p['payload']['evidence'] = ''
            if alteration == 'stale': s[1]['end_ms'] += 1
            with self.assertRaises(ValueError): module.apply(s, targets, [p])

    def test_resolved_multi_role_operation_is_not_reopened(self):
        args = fixture()
        args[2][0]['events'] = [dict(start_ms=a, end_ms=b, kind=k, person=p, unit='U2',
            action=action, needs_ownership=False) for a,b,k,p,action in [
                (90000, 94000, 'presenter', 'P2', 'personal_application'),
                (94000, 96000, 'own_detail', None, 'hand_operation'),
                (96000, 106000, 'presenter', 'P3', 'personal_application')]]
        self.assertEqual(module.plan(*args), [])
