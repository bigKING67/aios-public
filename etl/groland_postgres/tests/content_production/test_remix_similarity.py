from contextlib import ExitStack
import copy
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production import remix_similarity as review
from content_production.execution import Cancelled, file_hash
from content_production.workspace import WorkspaceLimit
from content_production.worker import process_one
from content_production.render_binding import current_binding


def fixture():
    snapshot = {"clips": [{"id": f"c{i}", "assetId": f"a{i}", "startMs": 1000, "endMs": 3000}
                          for i in range(2)],
                "assets": [{"assetId": f"a{i}", "sha256": str(i) * 64} for i in range(2)]}
    measured = [{"clipId": c["id"], "assetId": c["assetId"], "sourceStartMs": 1000, "renderedFrames": 60}
                for c in snapshot["clips"]]
    receipt = {"host_output_normalization": {"segmentLoudness": {"clips": measured}, "output": {"videoFrames": 120}}}
    return snapshot, receipt


class PictureReviewTests(unittest.TestCase):
    def samples(self):
        # Spatially textured, distinct frames; one matching consecutive pair.
        values = np.random.default_rng(7).integers(0, 256, (8, 56, 32, 3), dtype=np.uint8)
        values[5:7] = values[1:3]
        return values

    def compare(self, samples, snapshot=None):
        source, receipt = fixture()
        spans, _ = review.windows(snapshot or source, receipt)
        return review.compare(samples, spans, lambda: None, time.monotonic() + 5)

    def test_cross_source_consecutive_match_has_exact_output_and_source_positions(self):
        findings, count = self.compare(self.samples())
        self.assertEqual(count, 1)
        self.assertEqual(findings[0]["left"]["outputStartMs"], 500)
        self.assertEqual(findings[0]["right"]["outputStartMs"], 2500)
        self.assertEqual(findings[0]["right"]["sourceStartMs"], 1500)
        self.assertEqual(findings[0]["matchedSamples"], 2)

    def test_one_matching_frame_flat_color_and_different_pictures_do_not_warn(self):
        one = self.samples()
        one[6] = 255 - one[6]
        unrelated = np.random.default_rng(9).integers(0, 256, one.shape, dtype=np.uint8)
        for samples in [one, unrelated, np.zeros_like(one), np.full_like(one, [255, 0, 0])]:
            self.assertEqual(self.compare(samples), ([], 0))

    def test_same_asset_is_outside_cross_source_review(self):
        source, receipt = fixture()
        source['clips'][1]['assetId'] = 'a0'
        receipt['host_output_normalization']['segmentLoudness']['clips'][1]['assetId'] = 'a0'
        spans, _ = review.windows(source, receipt)
        self.assertEqual(review.compare(self.samples(), spans, lambda: None, time.monotonic()+5), ([], 0))

    def test_actual_frame_mapping_and_budget_are_checked(self):
        source, receipt = fixture()
        receipt['host_output_normalization']['segmentLoudness']['clips'][0]['renderedFrames'] = 61
        receipt['host_output_normalization']['output']['videoFrames'] = 121
        spans, frames = review.windows(source, receipt)
        self.assertEqual((spans[1]['startFrame'], frames), (61, 121))
        receipt['host_output_normalization']['output']['videoFrames'] = 120
        with self.assertRaises(ValueError): review.windows(source, receipt)
        receipt['host_output_normalization']['segmentLoudness']['clips'][0]['renderedFrames'] = 18001
        receipt['host_output_normalization']['output']['videoFrames'] = 18061
        with self.assertRaises(ValueError): review.windows(source, receipt)

    def test_report_is_advisory_bound_and_preserves_snapshot(self):
        source, receipt = fixture()
        before = copy.deepcopy(source)
        with tempfile.TemporaryDirectory() as folder:
            video = Path(folder)/'video.mp4'; video.write_bytes(b'fixture')
            sha = file_hash(video)
            receipt['host_inspection'] = {'status':'passed', 'sha256':sha}
            receipt['host_output_normalization']['output']['sha256'] = sha
            with patch.object(review, 'extract', return_value=self.samples()):
                report = review.review(source, video, receipt, Path(folder), lambda: None)
            self.assertEqual((report['status'], report['outputSha256'], report['deliveryApproved']), ('review_required', sha, False))
            self.assertEqual(source, before)
            receipt['host_inspection']['sha256'] = 'f'*64
            with patch.object(review, 'extract') as extract:
                report = review.review(source, video, receipt, Path(folder), lambda: None)
                extract.assert_not_called()
            self.assertEqual((report['status'], report['errorStage']), ('incomplete', 'binding'))

    def test_failures_are_incomplete_and_never_expose_exception_text(self):
        source, receipt = fixture()
        with tempfile.TemporaryDirectory() as folder:
            video=Path(folder)/'v';video.write_bytes(b'fixture')
            receipt['host_inspection']={'status':'passed','sha256':file_hash(video)}
            receipt['host_output_normalization']['output']['sha256']=file_hash(video)
            for error in [TimeoutError('private credential'), ValueError('private credential')]:
                with patch.object(review, 'extract', side_effect=error):
                    report=review.review(source, video, receipt, Path(folder), lambda:None)
                self.assertEqual(report['status'], 'incomplete')
                self.assertNotIn('private credential', str(report))
            for error in [Cancelled('cancel'), WorkspaceLimit('limit')]:
                with self.assertRaises(type(error)), patch.object(review, 'extract', side_effect=error):
                    review.review(source, video, receipt, Path(folder), lambda:None)

    def test_cancel_and_timeout_stop_owned_ffmpeg(self):
        for error in [Cancelled('cancel'), WorkspaceLimit('disk'), None]:
            with tempfile.TemporaryDirectory() as folder, patch.object(review.subprocess, 'Popen') as popen:
                proc = popen.return_value
                proc.poll.return_value = None
                tick = Mock(side_effect=[None, error] if error else None)
                with self.assertRaises(type(error) if error else TimeoutError):
                    review.extract(Path(folder)/'v', Path(folder), 120, tick, 0)
                proc.terminate.assert_called_once()
                proc.wait.assert_called_once()


class PictureReviewWorkerTests(unittest.TestCase):
    def test_only_final_selling_point_renders_get_advisory_receipt(self):
        for mode, preview in [('sellingPoint',False),('framework',False),('sellingPoint',True)]:
            with tempfile.TemporaryDirectory() as folder, ExitStack() as stack:
                stack.enter_context(patch.dict(os.environ, {'CONTENT_PRODUCTION_ENABLED':'true', 'CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES':'1'}))
                mocked={name:stack.enter_context(patch('content_production.worker.'+name)) for name in (
                    'connect_pg','TosStorageClient','TosStorageConfig.from_env','verify_module','verify_sources','claim','heartbeat','finish',
                    'run_bridge.reconcile','run_bridge.linkage','render_local','measure_clips','finalize_remix_output',
                    'inspect_output','review_remix_pictures','review_selected_sources','review_selected_semantics','review_treated_render','review_job')}
                snapshot={'aspect':'portrait','assets':[], 'clips':[], 'renderBinding':current_binding()}
                job={'job_id':'job','project_id':'project','revision':1,'preview':preview,'snapshot':snapshot}
                mocked['claim'].return_value=job
                mocked['run_bridge.linkage'].return_value={'run_id':'run','execution_version':1,'plan_revision':1,'task_type':'framework_remix','remix_mode':mode}
                for name in ['review_selected_sources','review_selected_semantics','review_treated_render','review_job']: mocked[name].return_value=None
                mocked['finish'].return_value=True
                mocked['render_local'].return_value=(Path(folder)/'video',{})
                mocked['finalize_remix_output'].return_value=(Path(folder)/'video',{})
                mocked['review_remix_pictures'].return_value={'status':'incomplete','deliveryApproved':False}
                self.assertEqual(process_one(Path(folder),Path(folder))['status'],'completed')
                receipt=mocked['finish'].call_args.kwargs['receipt']
                self.assertEqual('host_remix_picture_review' in receipt, mode=='sellingPoint' and not preview)
                if mode=='sellingPoint' and not preview:
                    self.assertEqual(receipt['host_remix_picture_review']['status'],'incomplete')
                    self.assertIs(mocked['review_remix_pictures'].call_args.args[0],snapshot)
