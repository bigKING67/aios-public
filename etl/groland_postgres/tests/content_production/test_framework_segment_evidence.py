import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.segment_suggestion_contract import (
    PROMPT_V13, build_prompt, postprocess, response_schema, finalize_framework_segments,
)

KEYS = {'mixed_voiceover', 'live_demo', 'street_interview', 'promotion'}


def observation(start, end, kind='single_presenter', label='live_demo'):
    return dict(start_sec=start, end_sec=end, label_key=label, confidence=.9, reason='观察证据',
                same_person_as_previous=False, visual_kind=kind,
                endorsement_marker='',
                continuous_start_sec=start if kind == 'single_presenter' else None,
                continuous_end_sec=end if kind == 'single_presenter' else None)


def process(*items):
    return postprocess({'segments': list(items)}, 120000, KEYS,
                       label_min_ms={'live_demo': 30000}, absorb_into={'live_demo': ['mixed_voiceover']},
                       version=PROMPT_V13)


class EvidenceTests(unittest.TestCase):
    def test_borrowed_endorsement_overrides_long_live_label(self):
        rows, stats = process(observation(0, 55, 'borrowed_endorsement'))
        self.assertEqual(rows[0]['label_key'], 'mixed_voiceover')
        self.assertEqual(stats['evidenceCorrections'], 1)

    def test_visible_endorsement_marker_overrides_inconsistent_source_kind(self):
        rows, _ = process({**observation(0, 55), 'endorsement_marker': '某某推荐'})
        self.assertEqual(rows[0]['label_key'], 'mixed_voiceover')

    def test_persistent_overlay_preserves_interview_and_promotion(self):
        rows, _ = process({**observation(0, 20, 'other', 'street_interview'), 'endorsement_marker': '某某推荐'},
                          {**observation(20, 40, 'other', 'promotion'), 'endorsement_marker': '某某推荐'})
        self.assertEqual([r['label_key'] for r in rows], ['street_interview', 'promotion'])

    def test_exact_ten_seconds_and_final_segment_have_no_exception(self):
        rows, _ = process(observation(0, 40), observation(40, 50))
        self.assertEqual([r['label_key'] for r in rows], ['live_demo', 'mixed_voiceover'])

    def test_independent_twenty_four_second_demo_survives_legacy_thirty(self):
        rows, _ = process(observation(0, 24.5), observation(24.5, 80, 'borrowed_endorsement'))
        self.assertEqual([r['label_key'] for r in rows], ['live_demo', 'mixed_voiceover'])

    def test_long_witness_does_not_promote_contextual_montage(self):
        rows, _ = process(observation(0, 21, label='mixed_voiceover'))
        self.assertEqual(rows[0]['label_key'], 'mixed_voiceover')

    def test_unused_endorsement_duration_cannot_override_source(self):
        rows, _ = process({**observation(0, 55, 'borrowed_endorsement'),
                           'continuous_start_sec': 0, 'continuous_end_sec': 55})
        self.assertEqual(rows[0]['label_key'], 'mixed_voiceover')

    def test_different_people_cannot_sum_short_intervals(self):
        rows, _ = process(observation(0, 8), observation(8, 17))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['label_key'], 'mixed_voiceover')

    def test_own_step_splits_do_not_reset_continuous_duration(self):
        rows, _ = process(observation(0, 7),
                          {**observation(7, 14), 'same_person_as_previous': True})
        self.assertEqual([(r['start_ms'], r['end_ms'], r['label_key']) for r in rows],
                         [(0, 14000, 'live_demo')])

    def test_gap_or_borrowed_insert_breaks_same_person_accumulation(self):
        for items in [
            [observation(0, 7), {**observation(8, 15), 'same_person_as_previous': True}],
            [observation(0, 7), observation(7, 8, 'borrowed_endorsement'),
             {**observation(8, 15), 'same_person_as_previous': True}],
            [observation(0, 7), {**observation(7, 14), 'same_person_as_previous': True,
                                 'continuous_start_sec': 8}],
        ]:
            with self.subTest(items=items):
                rows, _ = process(*items)
                self.assertTrue(all(r['label_key'] == 'mixed_voiceover' for r in rows))

    def test_qualified_different_people_keep_boundary(self):
        rows, _ = process(observation(0, 20), observation(20, 40))
        self.assertEqual(len(rows), 2)

    def test_strict_boundary_and_own_closeups(self):
        rows, _ = process(observation(0, 10.001))
        self.assertEqual(rows[0]['label_key'], 'live_demo')

    def test_source_end_cannot_supply_qualification_seconds(self):
        rows, _ = process(observation(110, 120.5))
        self.assertEqual(rows[0]['label_key'], 'mixed_voiceover')

    def test_source_snap_cannot_leave_a_ten_second_live_demo(self):
        rows, _ = process(observation(0, 10.2), observation(10.2, 35))
        rows[0]['end_ms'] = rows[1]['start_ms'] = 10000
        final, count = finalize_framework_segments(rows)
        self.assertEqual(count, 1)
        self.assertEqual([r['label_key'] for r in final], ['mixed_voiceover', 'live_demo'])
        self.assertEqual(rows[0]['label_key'], 'live_demo')  # no mutation of audit input

    def test_final_guard_preserves_distinct_qualified_people(self):
        rows, _ = process(observation(0, 20), observation(20, 40))
        final, count = finalize_framework_segments(rows)
        self.assertEqual(count, 0)
        self.assertEqual(len(final), 2)

    def test_overlap_cannot_preserve_an_invalid_long_witness(self):
        with self.assertRaises(ValueError):
            process(observation(0, 20), observation(15, 26))

    def test_invalid_or_absent_evidence_rejected(self):
        for changes in ({'visual_kind': None}, {'continuous_end_sec': 21}, {'continuous_start_sec': float('nan')},
                        {'same_person_as_previous': None}, {'continuous_end_sec': True},
                        {'visual_kind': 'other'}, {'label_key': 'unknown'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                process({**observation(0, 20), **changes})

    def test_schema_and_framework_only_scope(self):
        labels = [{'key': k, 'name': k, 'definition': ''} for k in KEYS]
        item = response_schema(labels, PROMPT_V13)['properties']['segments']['items']
        self.assertIn('visual_kind', item['required'])
        self.assertIn('continuous_end_sec', item['required'])
        self.assertIn('严格超过10秒', build_prompt('框架', labels, PROMPT_V13))
        self.assertNotIn('只有画面转为长时间连续、声画同步', build_prompt('框架', labels, PROMPT_V13))
        self.assertNotIn('先判断剪辑节奏', build_prompt('框架', labels, PROMPT_V13))
        with self.assertRaises(ValueError):
            build_prompt('其他预设', [{'key': 'a'}], PROMPT_V13)
