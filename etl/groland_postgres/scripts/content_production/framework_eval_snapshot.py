"""Execute evaluations from immutable private copies, preserving caller WIP."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ENV = 'CONTENT_FRAMEWORK_EVAL_RUNTIME_SNAPSHOT'


def is_snapshot(package=None):
    root = (package or Path(__file__).parent).resolve().parent
    marker = os.environ.get(ENV)
    return bool(marker and Path(marker).resolve() == root)


def run(argv, package=None):
    package = package or Path(__file__).parent
    with tempfile.TemporaryDirectory(prefix='framework-eval-runtime-') as folder:
        root = Path(folder)
        for name in ('content_production', 'marketing_content_assets'):
            target = root/name
            target.mkdir()
            for source in (package.parent/name).glob('*.py'):
                shutil.copy2(source, target/source.name)
        # Never import the mutable checkout ahead of the private packages.
        env = dict(os.environ, PYTHONPATH=str(root))
        env[ENV] = str(root)
        return subprocess.run([sys.executable, '-m', 'content_production.framework_evals', *argv],
                              env=env, check=False).returncode
