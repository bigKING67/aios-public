import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.workspace import RenderWorkspace, WorkspaceLimit


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        env = patch.dict(os.environ, {"CONTENT_PRODUCTION_WORK_MAX_BYTES": "1024", "CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES": "1"})
        env.start()
        self.addCleanup(env.stop)

    def test_budget_failure_and_exception_clean_only_owned_job(self):
        unrelated = self.root / "keep"
        unrelated.write_text("user data")
        with RenderWorkspace(self.root) as workspace:
            with self.assertRaises(WorkspaceLimit):
                with workspace.job() as work:
                    self.assertEqual(work, work.resolve())
                    (work / "media").write_bytes(b"a" * 1200)
                    workspace.check(force=True)
            self.assertFalse(work.exists())
            self.assertGreater(workspace.receipt()["peakObservedBytes"], 1024)
        self.assertEqual(unrelated.read_text(), "user data")

    def test_recovery_requires_owned_marker_and_preserves_symlinks(self):
        with RenderWorkspace(self.root) as workspace:
            owned = workspace.root / "job-abcdefgh"
            owned.mkdir()
            (owned / ".owner").write_bytes(workspace.MARKER)
            unknown = workspace.root / "job-12345678"
            unknown.mkdir()
            target = self.root / "outside"
            target.mkdir()
            (target / ".owner").write_bytes(workspace.MARKER)
            symlink = workspace.root / "job-87654321"
            symlink.symlink_to(target, target_is_directory=True)
        with RenderWorkspace(self.root) as workspace:
            self.assertEqual(workspace.recovered, 1)
            self.assertFalse(owned.exists())
            self.assertTrue(unknown.is_dir())
            self.assertTrue(symlink.is_symlink())
            self.assertTrue(target.is_dir())

    def test_inherited_child_lock_prevents_recovery_after_parent_closes(self):
        with RenderWorkspace(self.root) as workspace:
            stale = workspace.root / "job-abcdefgh"
            stale.mkdir()
            (stale / ".owner").write_bytes(workspace.MARKER)
            child = subprocess.Popen([sys.executable, "-c", "import sys; sys.stdin.read()"],
                                     stdin=subprocess.PIPE, pass_fds=(workspace.lock_fd,))
        try:
            with self.assertRaises(BlockingIOError):
                with RenderWorkspace(self.root):
                    self.fail("child's workspace must not be adopted")
            self.assertTrue(stale.exists())
        finally:
            child.stdin.close()
            child.wait(timeout=5)
        with RenderWorkspace(self.root) as workspace:
            self.assertEqual(workspace.recovered, 1)

    def test_low_free_space_rejected_before_consuming_a_job(self):
        with patch("content_production.workspace.shutil.disk_usage") as usage:
            usage.return_value.free = 0
            with self.assertRaises(WorkspaceLimit):
                with RenderWorkspace(self.root):
                    self.fail("must refuse low disk space")
        with RenderWorkspace(self.root):
            pass  # Failed admission released the root lock.

    def test_symlink_namespace_and_invalid_budgets_fail_closed(self):
        target = self.root / "outside"
        target.mkdir()
        (self.root / "aios-render-v1").symlink_to(target, target_is_directory=True)
        with self.assertRaises(RuntimeError):
            with RenderWorkspace(self.root):
                pass
        for value in ("0", "-1", "not-an-integer"):
            with patch.dict(os.environ, {"CONTENT_PRODUCTION_WORK_MAX_BYTES": value}):
                with self.assertRaises(ValueError):
                    RenderWorkspace(self.root)

    def test_non_private_existing_namespace_is_not_adopted(self):
        directory = self.root / "aios-render-v1"
        directory.mkdir(mode=0o755)
        directory.chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, "private"):
            with RenderWorkspace(self.root):
                self.fail("must not adopt a shared directory")


if __name__ == "__main__":
    unittest.main()
