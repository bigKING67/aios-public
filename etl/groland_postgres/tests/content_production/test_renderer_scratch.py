"""Exercise the real subprocess boundary without paid providers or video rendering."""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.execution import run_cli, Cancelled


class RendererScratchTests(unittest.TestCase):
    def exercise(self, mode, expected=None):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            # Python stands in for the engine, but process/environment/cleanup are real.
            (work / 'cli.mjs').write_text('''import os, pathlib, sys, time
scratch = pathlib.Path(os.environ['TMPDIR'])
(scratch / 'hyperframes-extract-cache-501').mkdir()
(scratch / 'hyperframes-extract-cache-501/frame.jpg').write_bytes(b'frame')
pathlib.Path(os.environ['HOME'], 'retained.txt').write_text(str(scratch))
if sys.argv[1] in ('timeout', 'cancel'): time.sleep(30)
if sys.argv[1] == 'fail': sys.exit(2)
''')
            def tick():
                if mode == 'cancel' and (work / 'retained.txt').exists():
                    raise Cancelled('cancel fixture')
            with patch.dict(os.environ, {'CONTENT_PRODUCTION_NODE': sys.executable}):
                if expected:
                    with self.assertRaises(expected):
                        run_cli(work, [mode], work, tick, timeout=1 if mode == 'timeout' else 10)
                else:
                    run_cli(work, [mode], work, tick)
            self.assertTrue((work / 'retained.txt').exists())
            self.assertTrue((work / 'renderer.log').exists())
            self.assertFalse(Path((work / 'retained.txt').read_text()).exists())
            self.assertEqual(list(work.glob('.aios-render-tmp-*')), [])

    def test_success(self): self.exercise('success')
    def test_failure(self): self.exercise('fail', RuntimeError)
    def test_timeout(self): self.exercise('timeout', TimeoutError)
    def test_cancel(self): self.exercise('cancel', Cancelled)


if __name__ == '__main__':
    unittest.main()
