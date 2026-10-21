import copy
import tempfile
import unittest
from pathlib import Path

from content_production.framework_annotation_alignment import alignment, timing_only_difference
from content_production.framework_eval_report import exact_error_spans, report
from content_production.framework_failure_queue import write_queue


POLICY = dict(id='business-rounded-seconds-v1', boundaryToleranceSeconds=1)


class AnnotationAlignmentTests(unittest.TestCase):
    def differences(self, gold, pred):
        evidence = alignment(gold, pred, POLICY)
        return [timing_only_difference(e, evidence) for e in exact_error_spans(gold, pred)]

    def test_boundary_can_shift_in_both_directions_without_changing_labels(self):
        gold = [[0, 10, 'mixed'], [10, 30, 'live']]
        for cut in (9, 9.7, 10.3, 11):
            pred = [[0, cut, 'mixed'], [cut, 30, 'live']]
            self.assertEqual(self.differences(gold, pred), [True])
        self.assertEqual(self.differences(gold, [[0, 11.01, 'mixed'], [11.01, 30, 'live']]), [False])

    def test_short_insert_and_missing_short_segment_are_not_timestamp_error(self):
        long = [[0, 30, 'live']]
        insert = [[0, 10, 'live'], [10, 10.117, 'mixed'], [10.117, 30, 'live']]
        self.assertEqual(self.differences(long, insert), [False])
        self.assertEqual(self.differences(insert, long), [False])

    def test_wrong_order_and_gap_are_not_covered_by_tolerance(self):
        gold = [[0, 10, 'mixed'], [10, 30, 'live']]
        for pred in ([[0, 10, 'live'], [10, 30, 'mixed']],
                     [[0, 9.9, 'mixed'], [10.1, 30, 'live']]):
            self.assertTrue(all(not x for x in self.differences(gold, pred)))

    def test_missing_tail_requires_source_duration_evidence(self):
        self.assertEqual(self.differences([[0, 30, 'live']], [[0, 29.9, 'live']]), [False])

    def test_manual_one_second_gap_is_unscored_and_preserved(self):
        gold = [[0, 9, 'mixed'], [10, 30, 'live']]
        saved = copy.deepcopy(gold)
        self.assertEqual(self.differences(gold, [[0, 9.7, 'mixed'], [9.7, 30, 'live']]), [])
        self.assertEqual(self.differences(gold, [[0, 10.5, 'mixed'], [10.5, 30, 'live']]), [True])
        self.assertEqual(gold, saved)

    def test_same_class_person_splits_do_not_change_semantic_transition(self):
        gold = [[0, 10, 'mixed'], [10, 30, 'live']]
        pred = [[0, 10.3, 'mixed'], [10.3, 20, 'live'], [20, 30, 'live']]
        self.assertEqual(self.differences(gold, pred), [True])

    def test_one_tolerated_boundary_does_not_excuse_other_large_shift(self):
        gold = [[0, 10, 'mixed'], [10, 20, 'live'], [20, 30, 'offer']]
        pred = [[0, 10.3, 'mixed'], [10.3, 22, 'live'], [22, 30, 'offer']]
        self.assertEqual(self.differences(gold, pred), [True, False])

    def test_unrelated_wrong_class_does_not_disable_local_boundary_tolerance(self):
        gold = [[0,10,'mixed'], [10,30,'live'], [30,40,'offer']]
        pred = [[0,10.3,'mixed'], [10.3,20,'live'], [20,22,'mixed'],
                [22,30.4,'live'], [30.4,40,'offer']]
        self.assertEqual(self.differences(gold,pred), [True,False,True])
        evidence = alignment(gold,pred,POLICY)
        self.assertFalse(evidence['categoryOrderMatches'])
        self.assertFalse(evidence['allTransitionsWithinTolerance'])

    def test_local_alignment_cannot_swallow_inserted_island_near_a_cut(self):
        gold = [[0,10,'mixed'], [10,30,'live']]
        pred = [[0,9.6,'mixed'], [9.6,9.8,'live'], [9.8,10.2,'mixed'], [10.2,30,'live']]
        self.assertEqual(self.differences(gold,pred), [False,True])
        self.assertEqual(self.differences(pred,gold), [False,True])

    def test_same_label_manual_gap_does_not_block_later_transition(self):
        gold = [[0,9,'live'], [10,20,'live'], [21,30,'offer']]
        pred = [[0,21.2,'live'], [21.2,30,'offer']]
        self.assertEqual(self.differences(gold,pred), [True])

    def test_repeated_transition_is_paired_once_in_source_order(self):
        gold = [[0,10,'mixed'], [10,10.3,'live'], [10.3,11,'mixed'], [11,30,'live']]
        pred = [[0,10.6,'mixed'], [10.6,30,'live']]
        self.assertEqual(self.differences(gold,pred), [False,True])

    def test_invalid_or_unbounded_policy_is_rejected(self):
        for value in (True, -1, 2, float('nan'), '1'):
            with self.assertRaises(ValueError):
                alignment([[0, 10, 'live']], [], dict(boundaryToleranceSeconds=value))

    def test_report_keeps_raw_score_and_queue_separates_annotation_drift(self):
        corpus = dict(films={'a':dict(file='a.mp4', sourceSha256='a',
            segments=[[0, 10, 'mixed'], [10, 30, 'live']])}, labels=[], assertions=[],
            gates=dict(minimum_accuracy=.9, maximum_regression=.02), annotationTiming=POLICY)
        base = [dict(film='a', pred=[[0, 10.6, 'mixed'], [10.6, 30, 'live']])]
        rows = [dict(base[0], sourceSha256='a')]
        result = report(corpus, base, rows, ['a'])
        self.assertLess(result['candidateMean'], 1)
        self.assertTrue(result['adoptionPassed'])
        self.assertEqual(result['unresolvedItems'], 0)
        self.assertEqual(result['toleratedBoundaryDifferences'], 1)
        with tempfile.TemporaryDirectory() as folder:
            item = write_queue(Path(folder), result, rows)['items'][0]
        self.assertFalse(item['adoptionBlocking'])
        self.assertEqual(item['errorSpans'], [])
        self.assertEqual(len(item['annotationTimingDifferences']), 1)
        self.assertEqual(base[0]['pred'][0][1], 10.6)

    def test_precise_user_boundary_remains_strict_under_rounded_gold_policy(self):
        corpus = dict(films={'a':dict(file='a.mp4', sourceSha256='a', segments=[[0, 30, 'live']])},
            labels=[], assertions=[dict(id='person',film='a',start=10,end=30,label='live',person_boundary=10)],
            gates=dict(minimum_accuracy=.9,maximum_regression=.02), annotationTiming=POLICY)
        rows = [dict(film='a',sourceSha256='a',pred=[[0,30,'live']])]
        result = report(corpus, rows, rows, ['a'])
        self.assertFalse(result['adoptionPassed'])
        self.assertIn('adjudicated_case:person', result['films'][0]['failures'])


if __name__ == '__main__':
    unittest.main()
