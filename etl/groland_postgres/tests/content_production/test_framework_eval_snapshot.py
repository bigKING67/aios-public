import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from content_production import framework_eval_snapshot as snapshot

class SnapshotTests(unittest.TestCase):
    def test_worker_runs_private_copy_and_does_not_restore_or_modify_checkout(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp)
            for name in ('content_production','marketing_content_assets'):
                (root/name).mkdir();(root/name/'__init__.py').write_text('original')
            observed=[]
            def launch(command,env,check):
                frozen=Path(env['PYTHONPATH']);observed.append(frozen)
                self.assertNotEqual(frozen,root)
                (root/'content_production/__init__.py').write_text('concurrent user change')
                self.assertEqual((frozen/'content_production/__init__.py').read_text(),'original')
                self.assertEqual(command[-2:],['run','--help'])
                with patch.dict(os.environ,{snapshot.ENV:str(frozen)}):
                    self.assertTrue(snapshot.is_snapshot(frozen/'content_production'))
                    self.assertFalse(snapshot.is_snapshot(root/'content_production'))
                return SimpleNamespace(returncode=2)
            with patch.object(snapshot.subprocess,'run',side_effect=launch):
                self.assertEqual(snapshot.run(['run','--help'],root/'content_production'),2)
            self.assertFalse(observed[0].exists())
            self.assertEqual((root/'content_production/__init__.py').read_text(),'concurrent user change')
