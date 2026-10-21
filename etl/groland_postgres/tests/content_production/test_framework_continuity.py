import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import framework_continuity as policy
from content_production.segment_suggestion_contract import postprocess, build_prompt, response_schema, PROMPT_V16


def evidence(spans):
    frames, facts = [], []
    for i, (a, b, person, unit, role) in enumerate(spans):
        frames.append(dict(index=i, start_ms=a, end_ms=b))
        facts.append(dict(i=i, p=person, u=unit, r=role,
                          l='matching_setting' if role == 'own_detail' else 'face' if person else 'none'))
    return frames, {'shots': facts}


def proposal(a, b, label='mixed_voiceover'):
    return dict(start_sec=a / 1000, end_sec=b / 1000, label_key=label)


class ContinuityTests(unittest.TestCase):
    def run_policy(self, spans, proposals=None):
        frames, facts = evidence(spans)
        duration = spans[-1][1]
        result, receipt = policy.apply({'segments': proposals or [proposal(0, duration)]}, frames, facts, duration)
        return [(s['start_sec'], s['end_sec'], s['label_key']) for s in result['segments']], receipt

    def test_caption_is_not_an_input_to_the_continuity_decision(self):
        spans = [(0, 60000, 'P1', 'U1', 'presenter')]
        base = proposal(0, 60000)
        for marker in ['', '@明星某某', '明星推荐', '直播回放']:
            rows, _ = self.run_policy(spans, [dict(base, endorsement_marker=marker)])
            self.assertEqual(rows, [(0, 60, 'live_demo')])

    def test_two_qualified_presenters_split_inside_one_coarse_proposal(self):
        rows, _ = self.run_policy([(0, 12000, 'A', 'U1', 'presenter'),
                                  (12000, 24000, 'B', 'U2', 'presenter')])
        self.assertEqual(rows, [(0, 12, 'live_demo'), (12, 24, 'live_demo')])

    def test_persons_never_add_their_short_durations(self):
        rows, _ = self.run_policy([(0, 7500, 'A', 'U1', 'presenter'),
                                  (7500, 15500, 'B', 'U2', 'presenter')])
        self.assertEqual(rows, [(0, 15.5, 'mixed_voiceover')])

    def test_complete_reviews_get_one_second_tolerance_independently(self):
        rows, _ = self.run_policy([(0, 7500, 'A', 'U0', 'presenter'),
                                  (7500, 17266, 'B', 'U1', 'presenter'),
                                  (17266, 26633, 'C', 'U2', 'presenter')])
        self.assertEqual(rows, [(0, 7.5, 'mixed_voiceover'), (7.5, 17.266, 'live_demo'),
                                (17.266, 26.633, 'live_demo')])

    def test_insert_disables_tolerance_and_never_sums_the_return(self):
        rows, receipt = self.run_policy([(0, 7000, 'A', 'U1', 'presenter'),
            (7000, 9000, '', '', 'independent_insert'), (9000, 18567, 'A', 'U1', 'presenter')])
        self.assertEqual(rows, [(0, 18.567, 'mixed_voiceover')])
        self.assertFalse(any(r['tolerance'] for r in receipt['runs']))

    def test_returning_face_in_different_recording_is_not_continuous(self):
        rows, _ = self.run_policy([(0, 5500, 'A', 'U1', 'presenter'),
            (5500, 8700, 'A', 'FILM_SET', 'presenter'), (8700, 15700, 'A', 'U1', 'presenter')])
        self.assertEqual(rows, [(0, 15.7, 'mixed_voiceover')])

    def test_own_detail_at_end_belongs_to_first_of_two_presenters(self):
        rows, _ = self.run_policy([(0, 8000, 'A', 'U1', 'presenter'),
            (8000, 12500, '', 'U1', 'own_detail'), (12500, 24500, 'B', 'U2', 'presenter')])
        self.assertEqual(rows, [(0, 12.5, 'live_demo'), (12.5, 24.5, 'live_demo')])

    def test_complete_review_crosses_false_first_stage_boundary(self):
        rows, _ = self.run_policy([(0, 5000, 'A', 'U1', 'presenter'),
            (5000, 51000, 'A', 'U1', 'presenter')], [proposal(0, 5000), proposal(5000, 51000, 'live_demo')])
        self.assertEqual(rows, [(0, 51, 'live_demo')])

    def test_own_skin_comparison_does_not_restart_duration(self):
        rows, _ = self.run_policy([(0, 5000, 'A', 'U1', 'presenter'),
            (5000, 7000, 'A', 'U1', 'own_detail'), (7000, 15000, 'A', 'U1', 'presenter')])
        self.assertEqual(rows, [(0, 15, 'live_demo')])

    def test_sales_and_interview_do_not_become_reviews_by_duration(self):
        for label in ['promotion', 'street_interview']:
            rows, _ = self.run_policy([(0, 20000, 'A', 'U1', 'presenter')], [proposal(0, 20000, label)])
            self.assertEqual(rows, [(0, 20, label)])

    def test_missing_duplicated_or_unknown_facts_fail(self):
        frames, facts = evidence([(0, 12000, 'A', 'U1', 'presenter')])
        for invalid in [{'shots': []}, {'shots': facts['shots'] * 2},
                        {'shots': [dict(facts['shots'][0], i=2)]}]:
            with self.assertRaises(ValueError): policy.source_shots(frames, invalid)

    def test_missed_cut_with_conflicting_representatives_never_qualifies(self):
        frames = [dict(index=i, start_ms=0, end_ms=14000) for i in range(2)]
        facts = {'shots': [dict(i=i, p=str(i), u=str(i), r='presenter', l='face') for i in range(2)]}
        result, receipt = policy.apply({'segments': [proposal(0, 14000)]}, frames, facts, 14000)
        self.assertEqual(result['segments'][0]['label_key'], 'mixed_voiceover')
        self.assertEqual(len(receipt['ambiguousShots']), 1)

    def test_verified_tolerance_survives_generic_postprocessing(self):
        frames, facts = evidence([(0, 9400, 'A', 'U1', 'presenter')])
        payload, _ = policy.apply({'segments': [proposal(0, 9400)]}, frames, facts, 9400)
        result, _ = postprocess(payload, 9400, {'live_demo', 'mixed_voiceover'},
                                label_min_ms={'live_demo': 30000}, version=PROMPT_V16)
        self.assertEqual(result[0]['label_key'], 'live_demo')

    def test_v16_prompt_and_schema_do_not_require_celebrity_source_fields(self):
        labels = [dict(key=k, name=k, definition='') for k in ('live_demo', 'mixed_voiceover')]
        prompt = build_prompt('framework', labels, PROMPT_V16)
        self.assertIn('角标、人名、明星身份', prompt)
        self.assertNotIn('无论连续多久', prompt)
        self.assertNotIn('endorsement_marker', response_schema(labels, PROMPT_V16)['properties']['segments']['items']['properties'])

    def test_subsecond_insert_is_preserved_after_verified_postprocessing(self):
        payload = {'segments': [dict(proposal(a,b,k), same_person_as_previous=False) for a,b,k in
            [(0,11000,'live_demo'),(11000,11600,'mixed_voiceover'),(11600,24000,'live_demo')]]}
        result, stats = postprocess(payload,24000,{'live_demo','mixed_voiceover'},version=PROMPT_V16)
        self.assertEqual([(s['start_ms'],s['end_ms']) for s in result], [(0,11000),(11000,11600),(11600,24000)])
        self.assertEqual(stats['dropped']['too_short'],0)

    def test_ownerless_hand_shots_do_not_qualify_without_a_presenter(self):
        rows, _ = self.run_policy([(0,14000,'','U1','own_detail')])
        self.assertEqual(rows, [(0,14,'mixed_voiceover')])
