import copy
from fractions import Fraction
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import selling_point_boundaries as boundaries
from content_production import selling_point_boundary_media as media
from content_production.execution import Cancelled


def segment(start, end, linked=False):
    return {'start_ms': start, 'end_ms': end, 'framework_index': 0, 'framework_segment_id': 'frame',
            'continues_previous': linked, 'reason': '本产品上脸不干', 'quote': '不干', 'label_key': 'moisturizing'}


class BoundaryTests(unittest.TestCase):
    def check(self, segments, speech, cuts, frames=None, duration=10000):
        frames = frames or [{'segment_id': 'frame', 'start_ms': 0, 'end_ms': duration}]
        before = copy.deepcopy((segments, frames, speech))
        result = boundaries.check(segments, frames, speech, duration, cuts)
        self.assertEqual((segments, frames, speech), before)
        return result

    def test_joint_evidence_extends_truncated_sentence_without_clipping_a_word(self):
        result, summary = self.check([segment(1200, 4900)], [[1010, 4980, '完整口播']],
                                     {1200: [Fraction(1000)], 4900: [Fraction(5000)]})
        self.assertEqual((result[0]['start_ms'], result[0]['end_ms']), (1000, 5000))
        self.assertEqual(summary['adjustedEdges'], 2)
        self.assertEqual(summary['status'], 'checked')

    def test_shot_inside_utterance_cannot_be_used_even_at_a_word_gap(self):
        result, _ = self.check([segment(1200, 4800)], [[900, 4900, '不能拆开']],
                               {1200: [Fraction(1000)], 4800: [Fraction(4800)]})
        self.assertEqual((result[0]['start_ms'], result[0]['end_ms']), (1200, 4800))
        self.assertIn('speech_shot_conflict', result[0]['boundary_review']['issues'])
        self.assertTrue(result[0]['reason'].startswith('【切口待复核'))

    def test_missing_or_remote_only_speech_never_auto_moves(self):
        for speech in (None, [[7000, 9000, 'only later speech']]):
            result, summary = self.check([segment(1200, 4000)], speech,
                                        {1200: [Fraction(1000)], 4000: [Fraction(4100)]})
            self.assertEqual((result[0]['start_ms'], result[0]['end_ms']), (1200, 4000))
            self.assertEqual(summary['status'], 'needs_review')

    def test_framework_residual_frame_is_flagged_without_mutation(self):
        frames = [{'segment_id': 'frame', 'start_ms': 182700, 'end_ms': 199971}]
        result, summary = self.check([segment(182840, 187000)], [[178760, 182600, '前句'], [182840, 184520, '降了']],
            {182700: [Fraction(548200, 3)], 182840: [Fraction(548200, 3)], 187000: []}, frames, 199971)
        edge = summary['frameworks'][0]['edges']['start']
        self.assertEqual((edge['finalMs'], edge['proposedMs']), (182700, 182734))
        self.assertIn('framework_boundary', result[0]['boundary_review']['issues'])

    def test_linked_internal_edges_do_not_move_or_become_separate_blocks(self):
        result, summary = self.check([segment(1000, 2500), segment(2700, 5000, True)],
            [[1000, 4990, '一句跨两个标注']], {1000: [Fraction(1000)], 5000: [Fraction(5000)]})
        self.assertEqual((result[0]['end_ms'], result[1]['start_ms']), (2500, 2700))
        self.assertTrue(result[1]['continues_previous'])
        self.assertEqual(len(summary['blocks']), 1)

    def test_no_short_segments_cross_framework_or_neighbour_after_calibration(self):
        result, summary = self.check([segment(1200, 2300), segment(2350, 5000)],
            [[900, 1000, '前'], [2000, 2450, '一句'], [4800, 4950, '后']],
            {1200: [Fraction(1000)], 2300: [Fraction(2500)], 2350: [Fraction(1900)], 5000: [Fraction(5000)]})
        self.assertLessEqual(result[0]['end_ms'], result[1]['start_ms'])
        self.assertTrue(all(s['end_ms'] - s['start_ms'] >= 1000 for s in result))
        self.assertTrue(any('range_conflict' in b['issues'] for b in summary['blocks']))

    def test_multiple_cuts_or_detector_failure_require_review(self):
        for cuts in (None, [], [Fraction(1000), Fraction(1100)]):
            result, _ = self.check([segment(1000, 5000)], [[1200, 4900, '口播']], {1000: cuts, 5000: []})
            self.assertEqual(result[0]['start_ms'], 1000)
            self.assertEqual(result[0]['boundary_review']['status'], 'needs_review')

    def test_fractional_frame_does_not_round_back_into_previous_shot(self):
        result, _ = self.check([segment(182700, 190000)], [[182840, 189900, '降了']],
            {182700: [Fraction(548200, 3)], 190000: [Fraction(570001, 3)]}, duration=199971)
        self.assertEqual((result[0]['start_ms'], result[0]['end_ms']), (182734, 190000))

    def test_render_frame_floor_cannot_turn_a_complete_sentence_into_checked(self):
        result, _ = self.check([segment(1001, 5000)], [[1100, 5000, '末字完整']],
                               {1001: [Fraction(1001)], 5000: [Fraction(5000)]})
        audit = result[0]['boundary_review']
        self.assertEqual(audit['status'], 'needs_review')
        self.assertIn('render_sentence_crossing', audit['issues'])
        self.assertEqual(audit['edges']['end']['renderedEndMs'], {'num': 14903, 'den': 3})


class MediaTests(unittest.TestCase):
    def test_integer_pts_not_truncated_decimal_is_authoritative(self):
        cuts = media.parse_cuts('[Parsed_showinfo] config in time_base: 1/15360, frame_rate: 60/1\n'
                                '[Parsed_showinfo] n: 0 pts:2806784 pts_time:182.733333 duration: 256')
        self.assertEqual(cuts, [Fraction(548200, 3)])

    def test_failure_and_budget_are_reviewable_but_cancellation_propagates(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(media, 'run_media', side_effect=OSError('fixture')):
                self.assertEqual(media.observe('source', [1000], 5000, {}, lambda: None, Path(tmp)), {1000: None})
            with patch.object(media, 'TOTAL_SECONDS', 0), patch.object(media, 'run_media') as run:
                self.assertEqual(media.observe('source', [1000], 5000, {}, lambda: None, Path(tmp)), {1000: None})
                run.assert_not_called()
            with patch.object(media, 'run_media', side_effect=Cancelled()), self.assertRaises(Cancelled):
                media.observe('source', [1000], 5000, dict(os.environ), lambda: None, Path(tmp))
