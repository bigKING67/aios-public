import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.framework_evaluation import compare


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.truth={'a':[[0,100,'live']], 'b':[[0,100,'mixed']]}
        self.base=[{'film':'a','pred':[[0,100,'live']]}, {'film':'b','pred':[[0,80,'mixed'],[80,100,'live']]}]

    def test_mean_gain_cannot_hide_individual_regression(self):
        candidate=[{'film':'a','pred':[[0,95,'live'],[95,100,'mixed']]}, {'film':'b','pred':[[0,100,'mixed']]}]
        report=compare(self.truth,self.base,candidate)
        self.assertGreater(report['candidate_mean'],report['baseline_mean'])
        self.assertFalse(report['passed'])
        self.assertEqual(report['films'][0]['failures'],['regression'])

    def test_missing_duplicate_or_extra_films_rejected(self):
        for rows in [self.base[:1],self.base+self.base[:1],self.base+[{'film':'c','pred':[[0,100,'live']]}]]:
            with self.assertRaises(ValueError):compare(self.truth,self.base,rows)

    def test_reported_score_is_not_trusted(self):
        candidate=[dict(r,second_accuracy=1) for r in self.base]
        self.assertFalse(compare(self.truth,self.base,candidate)['passed'])

    def test_gaps_and_overlaps_are_not_free_accuracy(self):
        bad=[{'film':'a','pred':[[0,10,'live']]},self.base[1]]
        self.assertEqual(compare(self.truth,self.base,bad)['films'][0]['candidate'],.1)
        bad[0]['pred']=[[0,60,'live'],[50,100,'live']]
        with self.assertRaises(ValueError):compare(self.truth,self.base,bad)

    def test_complete_nonregressing_candidate_passes(self):
        candidate=[{'film':k,'pred':v} for k,v in self.truth.items()]
        self.assertTrue(compare(self.truth,self.base,candidate)['passed'])

    def test_reference_gaps_are_reported_and_never_filled_or_credited(self):
        truth={'a':[[0,4,'live'],[6,10,'mixed']]}
        base=[{'film':'a','pred':truth['a']}]
        candidate=[{'film':'a','pred':[[0,6,'live'],[6,10,'mixed']]}]
        row=compare(truth,base,candidate)['films'][0]
        self.assertEqual((row['scoredSeconds'],row['unannotatedSeconds']),(8,2))
        self.assertEqual(row['candidate'],1)
