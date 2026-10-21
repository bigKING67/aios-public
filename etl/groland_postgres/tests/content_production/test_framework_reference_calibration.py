"""Acceptance follows reviewed evidence without weakening precise defect guards."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.framework_eval_report import report, write_report


class ReferenceCalibrationTests(unittest.TestCase):
    def setUp(self):
        self.corpus = dict(films={
            'a': dict(file='a.mp4', sourceSha256='a'*64,
                      segments=[[0,10,'实拍内容'],[10,20,'混剪口播']]),
            'b': dict(file='b.mp4', sourceSha256='b'*64, segments=[[0,20,'实拍内容']])},
            assertions=[], labels=[dict(key='live_demo',name='实拍内容')],
            gates=dict(minimum_accuracy=.9,maximum_regression=.02),
            annotationTiming=dict(id='integer-v1',boundaryToleranceSeconds=1),
            regressionCases=[dict(id='source-cut',film='a',start=8.4,end=10,label='混剪口播',
                source_boundary=8.4,source_before_label='实拍内容',source_after_label='混剪口播',
                source_frame_pts=[8.366667,8.4],source_evidence_sha256='c'*64,
                context_evidence_sha256='d'*64)],
            acceptancePolicy=dict(id='source-calibrated-v1',
                basis='Owner requested reviewed source cuts and current decisions as acceptance reference.',
                sourceBoundaryCorrections=[dict(guardId='source-cut',film='a',
                    sourceSha256='a'*64,originalBoundarySeconds=10)]))
        self.base=[dict(film=f,pred=copy.deepcopy(x['segments'])) for f,x in self.corpus['films'].items()]
        self.rows=[dict(r,sourceSha256=self.corpus['films'][r['film']]['sourceSha256']) for r in self.base]
        self.rows[0]['pred']=[[0,8.4,'实拍内容'],[8.4,20,'混剪口播']]

    def evaluate(self,rows=None,scope=None):
        return report(self.corpus,self.base,self.rows if rows is None else rows,scope or ['a','b'])

    def test_verified_source_cut_passes_current_gate_and_keeps_original_failure(self):
        before=copy.deepcopy(self.corpus)
        result=self.evaluate()
        self.assertTrue(result['adoptionPassed'])
        self.assertEqual(result['unresolvedItems'],0)
        self.assertEqual(result['candidateMean'],1)
        self.assertFalse(result['originalEvaluation']['adoptionPassed'])
        self.assertEqual(result['originalEvaluation']['unresolvedItems'],1)
        self.assertLess(result['originalEvaluation']['candidateMean'],1)
        self.assertEqual(result['referenceCalibration']['sourceCorrectionCount'],1)
        self.assertEqual(self.corpus,before)

    def test_current_owner_label_is_applied_with_all_original_diagnostics_retained(self):
        self.corpus['assertions']=[dict(id='owner-review',film='b',start=0,end=20,label='混剪口播')]
        self.rows[1]['pred']=[[0,20,'混剪口播']]
        result=self.evaluate()
        self.assertTrue(result['adoptionPassed'])
        self.assertEqual(result['candidateMean'],1)
        self.assertEqual(result['originalEvaluation']['films'][1]['candidate'],0)
        self.assertIn('below_minimum',result['originalEvaluation']['films'][1]['failures'])

    def test_rounding_back_or_one_frame_drift_fails_precise_guard(self):
        for cut in (10,8.433333):
            with self.subTest(cut=cut):
                rows=copy.deepcopy(self.rows)
                rows[0]['pred']=[[0,cut,'实拍内容'],[cut,20,'混剪口播']]
                result=self.evaluate(rows)
                self.assertFalse(result['adoptionPassed'])
                self.assertIn('regression_case:source-cut',result['films'][0]['failures'])

    def test_uncalibrated_short_insertion_or_missing_coverage_still_blocks(self):
        for pred in ([[0,8.4,'实拍内容'],[8.4,12,'混剪口播'],[12,12.117,'机制'],[12.117,20,'混剪口播']],
                     [[0,8.4,'实拍内容'],[8.4,12,'混剪口播'],[12.117,20,'混剪口播']]):
            rows=copy.deepcopy(self.rows);rows[0]['pred']=pred
            result=self.evaluate(rows)
            self.assertFalse(result['adoptionPassed'])
            self.assertGreater(result['unresolvedItems'],0)

    def test_missing_result_source_mismatch_and_audio_unknown_still_block(self):
        cases=[self.rows[:1],copy.deepcopy(self.rows),copy.deepcopy(self.rows)]
        cases[1][0]['sourceSha256']='e'*64
        cases[2][0]['publication']=dict(summary=dict(frameworkVerification=dict(editorial=dict(
            audioConflicts=[dict(start_ms=1000,end_ms=2000)]))))
        for rows in cases:
            self.assertFalse(self.evaluate(rows)['adoptionPassed'])

    def test_scoped_success_is_still_not_full_adoption(self):
        result=self.evaluate(self.rows[:1],['a'])
        self.assertTrue(result['scopedPassed'])
        self.assertFalse(result['adoptionPassed'])

    def test_wrong_original_edge_source_or_missing_evidence_cannot_create_calibration(self):
        original=copy.deepcopy(self.corpus)
        for mutation in ('edge','hash','guard','duplicate','proof','pts','policy','outside','conflict'):
            with self.subTest(mutation=mutation):
                self.corpus=copy.deepcopy(original)
                policy=self.corpus['acceptancePolicy'];entry=policy['sourceBoundaryCorrections'][0]
                guard=self.corpus['regressionCases'][0]
                if mutation=='edge': entry['originalBoundarySeconds']=11
                if mutation=='hash': entry['sourceSha256']='e'*64
                if mutation=='guard': entry['guardId']='unreviewed'
                if mutation=='duplicate': policy['sourceBoundaryCorrections'].append(dict(entry))
                if mutation=='proof': del guard['context_evidence_sha256']
                if mutation=='pts': guard['source_frame_pts']=[8.4,8.366667]
                if mutation=='policy': policy['id']='unrecognized-policy'
                if mutation=='outside': guard['source_boundary']=21
                if mutation=='conflict':
                    self.corpus['assertions']=[dict(id='conflict',film='a',start=8.4,end=10,label='实拍内容')]
                with self.assertRaises(ValueError): self.evaluate()

    def test_adjacent_person_boundary_and_fixed_historical_baselines_remain_required(self):
        self.corpus['assertions']=[dict(id='person',film='b',start=0,end=20,label='实拍内容',person_boundary=10)]
        self.assertFalse(self.evaluate()['adoptionPassed'])
        self.rows[1]['pred']=[[0,10,'实拍内容'],[10,20,'实拍内容']]
        self.assertTrue(self.evaluate()['adoptionPassed'])
        self.corpus['guardBaselines']=[dict(name='fixed',rows=copy.deepcopy(self.rows))]
        self.rows[1]['pred']=[[0,10,'实拍内容'],[10,12,'混剪口播'],[12,20,'实拍内容']]
        self.assertFalse(self.evaluate()['adoptionPassed'])

    def test_report_and_repair_queue_distinguish_current_gate_from_original_reference(self):
        with tempfile.TemporaryDirectory() as folder:
            output=Path(folder)
            result=write_report(output,self.corpus,self.base,self.rows,['a','b'],[])
            self.assertTrue(result['adoptionPassed'])
            self.assertIn('校准', (output/'report.md').read_text())
            self.assertIn('原业务', (output/'report.md').read_text())
            queue=json.loads((output/'repair-queue.json').read_text())
            self.assertFalse(any(x['adoptionBlocking']for x in queue['items']))
            self.assertEqual(queue['referencePolicy'],'source-calibrated-v1')

    def test_runtime_change_and_interruption_still_invalidate_calibrated_acceptance(self):
        for metadata in (dict(codeChangedDuringRun=['runtime.py']),dict(interruptedBy='test')):
            with tempfile.TemporaryDirectory() as folder:
                output=Path(folder);(output/'manifest.json').write_text(json.dumps(metadata))
                result=write_report(output,self.corpus,self.base,self.rows,['a','b'],[])
                self.assertFalse(result['adoptionPassed'])
                self.assertFalse(result['repairComplete'])
