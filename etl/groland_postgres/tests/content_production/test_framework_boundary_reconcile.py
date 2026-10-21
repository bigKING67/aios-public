import sys
import json
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_boundary_reconcile import reconcile, transition_onset, close_terminal_frame
from content_production.segment_suggestion_worker import _snap


def segment(a, b, label):
    return dict(start_ms=a, end_ms=b, label_key=label)


def event(a, b, person, kind='presenter'):
    return dict(start_ms=a, end_ms=b, person=person, kind=kind)


def window(events):
    return dict(start=0, end=40000, events=events)


class BoundaryReconcileTests(unittest.TestCase):
    def test_final_partial_frame_closes_to_video_endpoint_without_new_duration_claim(self):
        rows=[segment(0,186900,'promotion')]
        frames={'frames':[{'best_effort_timestamp_time':'186.896552','duration_time':'0.034483'}]}
        with patch('content_production.shot_catalog.run',return_value=json.dumps(frames).encode()):
            result,proof=close_terminal_frame(rows,186931,Path('/tmp/source.mp4'),{},lambda:None)
        self.assertEqual(result,[segment(0,186931,'promotion')])
        self.assertEqual(rows[0]['end_ms'],186900)
        self.assertEqual(proof['before_ms'],186900)
        self.assertEqual(proof['kind'],'terminal_frame_rounding')

    def test_tail_repair_cannot_absorb_missing_frame_or_audio_padding(self):
        rows=[segment(0,186900,'promotion')]
        cases=[{'frames':[]}, {'frames':[{}]},
            {'frames':[{'best_effort_timestamp_time':'186.900','duration_time':'0.031'}]},
            {'frames':[{'best_effort_timestamp_time':'186.910','duration_time':'0.021'}]},
            {'frames':[{'best_effort_timestamp_time':'186.896552','duration_time':'NaN'}]},
            {'frames':[{'best_effort_timestamp_time':'186.890','duration_time':'0.020'}]}]
        for frames in cases:
            with self.subTest(frames=frames), patch('content_production.shot_catalog.run',return_value=json.dumps(frames).encode()):
                self.assertEqual(close_terminal_frame(rows,186931,Path('/tmp/source.mp4'),{},lambda:None),(rows,None))
        with patch('content_production.shot_catalog.run') as probe:
            for duration in [186900,187001]:
                self.assertEqual(close_terminal_frame(rows,duration,Path('/tmp/source.mp4'),{},lambda:None),(rows,None))
            probe.assert_not_called()

    def test_soft_offer_transition_fallback_is_candidate_only_and_not_a_generic_motion_snap(self):
        rows=[segment(0,20000,'street_interview'),segment(20000,40000,'promotion')]
        cuts=[(19733,.03),(19766,.11),(19833,.10)]
        with patch('content_production.segment_shot_hints.refine_cuts',side_effect=[[],cuts]) as detect:
            out,receipt=_snap(rows,Path('/tmp/video.mp4'),1000,{},lambda:None,Path('/tmp'),prefer_nearest=True)
            self.assertEqual(out[0]['end_ms'],19733)
            self.assertEqual(detect.call_args.kwargs['threshold'],.02)
            self.assertEqual(receipt['gapRepairs'][0]['reason'],'offer_transition')
        with patch('content_production.segment_shot_hints.refine_cuts',return_value=[]) as detect:
            _snap(rows,Path('/tmp/video.mp4'),1000,{},lambda:None,Path('/tmp'),prefer_nearest=False)
            self.assertEqual(detect.call_count,1)
            rows[0]['label_key']='live_demo'
            _snap(rows,Path('/tmp/video.mp4'),1000,{},lambda:None,Path('/tmp'),prefer_nearest=True)
            self.assertEqual(detect.call_count,2)

    def test_complete_review_tail_is_not_cut_at_coarse_proposal(self):
        rows=[segment(0,20000,'live_demo'),segment(20000,40000,'mixed_voiceover')]
        w=window([dict(event(0,21500,'A'),unit='A'),dict(event(21500,40000,'B'),unit='B')])
        w['measured']=dict(runs=[dict(start_ms=0,end_ms=21500,unit='A',qualifies=True)])
        result,receipt=reconcile(rows,[w])
        self.assertEqual(result[1]['start_ms'],21500)
        self.assertEqual(receipt['corrections'][0]['kind'],'qualified_review_tail')
        # A cut at the current boundary or a short unqualified core cannot extend.
        w['measured']['runs'][0]['end_ms']=20000
        self.assertEqual(reconcile(rows,[w])[0],rows)

    def test_flash_transition_gap_uses_onset_and_rejects_motion_or_distinct_changes(self):
        self.assertEqual(transition_onset([(16533,.033), (16566,.118), (16633,.114), (16900,.022)]),
                         (16533,.118))
        self.assertIsNone(transition_onset([(16533,.033), (16900,.022)]))
        self.assertIsNone(transition_onset([(16533,.118), (16900,.114)]))

    def test_coarse_boundary_sliver_belongs_to_observed_interview_source(self):
        rows = [segment(0, 20000, 'live_demo'), segment(20000, 20133, 'mixed_voiceover'),
                segment(20133, 30000, 'street_interview')]
        observed = [window([event(0, 20000, 'A'), event(20000, 30000, 'B')])]
        result, receipt = reconcile(rows, observed)
        self.assertEqual(result, [rows[0], segment(20000, 30000, 'street_interview')])
        self.assertEqual(len(receipt['corrections']), 1)
        self.assertEqual(rows[2]['start_ms'], 20133)

    def test_real_short_insert_missing_and_disagreeing_evidence_are_preserved(self):
        rows = [segment(0, 20000, 'live_demo'), segment(20000, 20200, 'mixed_voiceover'),
                segment(20200, 30000, 'promotion')]
        real = window([event(0, 20000, 'A'), event(20000, 20200, '', 'independent_insert'),
                       event(20200, 30000, 'B')])
        spanning = window([event(0, 20000, 'X'), event(20000, 30000, 'Y')])
        for observed in ([], [real], [real, spanning]):
            self.assertEqual(reconcile(rows, observed)[0], rows)

    def test_opening_flash_and_independent_live_people_are_preserved(self):
        for rows in ([segment(0, 100, 'mixed_voiceover'), segment(100, 30000, 'live_demo')],
                     [segment(0, 20000, 'live_demo'), segment(20000, 20100, 'mixed_voiceover'),
                      segment(20100, 35000, 'live_demo')]):
            self.assertEqual(reconcile(rows, [window([event(0, 40000, 'A')])])[0], rows)

    def test_interview_exit_uses_source_entry_not_its_later_product_shot(self):
        rows = [segment(0, 20800, 'street_interview'), segment(20800, 35000, 'mixed_voiceover')]
        events = [event(0, 20000, 'A'), event(20000, 20800, 'B'),
                  event(20800, 21600, 'B', 'independent_insert'), event(21600, 40000, 'B')]
        result, receipt = reconcile(rows, [window(events)])
        self.assertEqual((result[0]['end_ms'], result[1]['start_ms']), (20000, 20000))
        self.assertEqual(receipt['corrections'][0]['kind'], 'source_entry_before_detail')
        rows[0]['label_key'],rows[1]['label_key']='mixed_voiceover','street_interview'
        self.assertEqual(reconcile(rows,[window(events)])[0][1]['start_ms'],20000)

    def test_review_category_does_not_disable_the_same_observed_source_entry(self):
        events = [event(0, 20000, 'A'), event(20000, 20800, 'B'),
                  event(20800, 21600, 'B', 'independent_insert'), event(21600, 40000, 'B')]
        for before, after in [('street_interview', 'live_demo'), ('live_demo', 'street_interview')]:
            with self.subTest(before=before, after=after):
                rows = [segment(0, 20800, before), segment(20800, 35000, after)]
                result, receipt = reconcile(rows, [window(events)])
                self.assertEqual(result, [segment(0, 20000, before), segment(20000, 35000, after)])
                self.assertEqual(receipt['corrections'][0]['kind'], 'source_entry_before_detail')
                # A disagreeing window still blocks the correction. No class
                # or duration claim can substitute for a shared physical edge.
                other = window([event(0, 20400, 'X'), event(20400, 40000, 'Y')])
                self.assertEqual(reconcile(rows, [window(events), other])[0], rows)

    def test_offer_uses_shared_insert_entry_but_cannot_cross_a_separate_shot(self):
        rows=[segment(0,20300,'mixed_voiceover'),segment(20300,35000,'promotion')]
        observed=window([event(0,20000,'A'),event(20000,35000,'','independent_insert')])
        self.assertEqual(reconcile(rows,[observed])[0][1]['start_ms'],20000)
        other=window([event(0,20300,'A'),event(20300,35000,'','independent_insert')])
        self.assertEqual(reconcile(rows,[observed,other])[0],rows)

    def test_ids_are_local_and_unknown_or_conflicting_source_edges_block_repair(self):
        rows = [segment(0, 20800, 'street_interview'), segment(20800, 35000, 'mixed_voiceover')]
        valid = [event(0, 20000, 'A'), event(20000, 40000, 'B')]
        # Same local IDs have no cross-window identity meaning; only edge agreement matters.
        other = [event(0, 20000, 'B'), event(20000, 40000, 'A')]
        self.assertEqual(reconcile(rows, [window(valid), window(other)])[0][1]['start_ms'], 20000)
        for events in ([event(0, 40000, 'A')], [event(0, 20000, 'A'), event(20000, 40000, '')],
                       [event(0, 20200, 'A'), event(20200, 40000, 'B')]):
            self.assertEqual(reconcile(rows, [window(valid), window(events)])[0], rows)


if __name__ == '__main__':
    unittest.main()
