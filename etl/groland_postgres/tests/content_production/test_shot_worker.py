import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.shot_worker import extract
from content_production.execution import Cancelled


class ShotWorkerTests(unittest.TestCase):
    def test_cancel_terminates_own_child_and_scrubs_service_env(self):
        original = subprocess.Popen
        children = []
        environments = []
        def start(_command, **kwargs):
            environments.append(kwargs['env'])
            process = original([sys.executable, '-c', 'import time; time.sleep(30)'], **kwargs)
            children.append(process)
            return process
        def cancel():
            raise Cancelled('fixture cancellation')
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'DATABASE_URL': 'fixture-only', 'TOS_SECRET_ACCESS_KEY': 'fixture-only'}):
            with patch('content_production.shot_worker.subprocess.Popen', side_effect=start):
                with self.assertRaises(Cancelled):
                    extract(Path(folder) / 'unused.mp4', {'assetId': 'fixture', 'sha256': 'a'*64}, Path(folder), cancel)
        self.assertEqual(len(children), 1)
        self.assertIsNotNone(children[0].poll())
        self.assertNotIn('DATABASE_URL', environments[0])
        self.assertNotIn('TOS_SECRET_ACCESS_KEY', environments[0])


if __name__ == '__main__':
    unittest.main()
