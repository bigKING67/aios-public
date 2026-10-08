from contextlib import ExitStack
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.worker import process_one
from content_production.execution import Cancelled
from content_production.render_binding import current_binding


class WorkerWorkspaceTests(unittest.TestCase):
    def test_review_candidate_is_saved_separately_from_rendered_receipt(self):
        for mode in ('disabled', 'rendered', 'failed', 'cancelled'):
            with tempfile.TemporaryDirectory() as folder, ExitStack() as stack:
                stack.enter_context(patch.dict(os.environ, {"CONTENT_PRODUCTION_ENABLED": "true", "CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES": "1", "AIOS_CAPTION_RENDER_CANDIDATE": "false" if mode == "disabled" else "true"}))
                mocked = {name: stack.enter_context(patch("content_production.worker." + name)) for name in (
                    "connect_pg", "TosStorageClient", "TosStorageConfig.from_env", "verify_module", "verify_sources", "claim",
                    "heartbeat", "finish", "run_bridge.reconcile", "run_bridge.linkage", "render_snapshot_document", "review_job", "render_candidate")}
                snapshot = {"aspect": "portrait", "assets": [], "editDocument": {"revision": 1}, "renderBinding": current_binding()}
                mocked["claim"].return_value = {"job_id": "job", "project_id": "project", "revision": 1, "preview": False, "snapshot": snapshot}
                mocked["run_bridge.linkage"].return_value = {"run_id": "run", "execution_version": 1, "plan_revision": 1}
                mocked["finish"].return_value = True
                original = {"caption_quality": {"status": "unverified", "documentSha256": "frozen"}}
                mocked["render_snapshot_document"].return_value = (Path(folder) / "video.mp4", original)
                mocked["review_job"].return_value = {"candidate": {"document": {"revision": 2}}, "candidateRendered": False, "deliveryApproved": False}
                mocked['render_candidate'].return_value = (Path(folder)/'candidate.mp4', {'deliveryApproved': False})
                if mode in ('failed', 'cancelled'):
                    mocked['render_candidate'].side_effect = Cancelled('cancel') if mode == 'cancelled' else RuntimeError('private error')
                result = process_one(Path(folder), Path(folder))
                if mode == 'cancelled':
                    self.assertEqual(result['status'], 'cancelled')
                    mocked['TosStorageClient'].return_value.upload_file.assert_not_called()
                    continue
                self.assertEqual(result['status'], 'completed')
                receipt = mocked['finish'].call_args.kwargs['receipt']
                self.assertEqual(receipt['caption_quality'], {"status": "unverified", "documentSha256": "frozen"})
                self.assertEqual(receipt['host_revision'], 1)
                self.assertEqual(snapshot['editDocument']['revision'], 1)
                self.assertEqual(receipt['host_caption_review']['candidateRendered'], mode == 'rendered')
                uploads = mocked['TosStorageClient'].return_value.upload_file
                self.assertEqual(uploads.call_count, 2 if mode == 'rendered' else 1)
                if mode == 'rendered':
                    self.assertTrue(uploads.call_args_list[0].args[0].endswith('/caption-candidate.mp4'))
                    self.assertTrue(uploads.call_args_list[1].args[0].endswith('/video.mp4'))
                if mode == 'failed':
                    self.assertEqual(receipt['host_caption_review']['candidateRender']['status'], 'failed')
                    self.assertNotIn('private error', str(receipt))

    def test_exhausted_download_and_cancel_never_upload_and_leave_no_job_directory(self):
        for outcome in ("budget", "cancel"):
            with self.subTest(outcome=outcome), tempfile.TemporaryDirectory() as folder, ExitStack() as stack:
                stack.enter_context(patch.dict(os.environ, {"CONTENT_PRODUCTION_ENABLED": "true", "CONTENT_PRODUCTION_WORK_MAX_BYTES": "1024", "CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES": "1"}))
                mocked = {name: stack.enter_context(patch("content_production.worker." + name)) for name in (
                    "connect_pg", "TosStorageClient", "TosStorageConfig.from_env", "verify_module", "verify_sources", "claim",
                    "heartbeat", "finish", "run_bridge.reconcile", "run_bridge.linkage", "download", "render_local")}
                mocked["run_bridge.linkage"].return_value = None
                mocked["finish"].return_value = True
                mocked["claim"].return_value = {"job_id": "job", "project_id": "project", "revision": 1, "preview": False,
                    "snapshot": {"aspect": "portrait", "assets": [{"assetId": "a", "objectKey": "local", "sha256": "unused"}]}}
                def download(_storage, _key, destination, _sha, _tick):
                    destination.write_bytes(b"a" * (1200 if outcome == "budget" else 10))
                mocked["download"].side_effect = download
                mocked["render_local"].side_effect = Cancelled("test cancellation")
                root = Path(folder)
                result = process_one(root, root)
                self.assertEqual(result["status"], "failed" if outcome == "budget" else "cancelled")
                self.assertEqual(list((root / "aios-render-v1").glob("job-*")), [])
                mocked["TosStorageClient"].return_value.upload_file.assert_not_called()
                if outcome == "budget":
                    mocked["render_local"].assert_not_called()
                    self.assertEqual(result["errorType"], "WorkspaceLimit")
                    self.assertIn("磁盘预算", mocked["finish"].call_args.kwargs["error"])
