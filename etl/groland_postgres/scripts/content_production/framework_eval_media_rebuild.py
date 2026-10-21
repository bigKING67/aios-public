"""Certify historical media recipes by offline execution of their archived code."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys


def load_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reconstruct(args):
    archive = args.archive.resolve()
    metadata = json.loads((archive/'manifest.json').read_text())
    package = archive/'code'
    for name, sha in metadata['code'].items():
        if hashlib.sha256((package/name).read_bytes()).hexdigest() != sha:
            raise ValueError('Archived runtime changed')
    films = args.films.split(',')
    if any(not (archive/f/'run.json').is_file() for f in films):
        raise ValueError('Missing completed historical film')
    if os.environ.get('CONTENT_FRAMEWORK_EVAL_RUNTIME_SNAPSHOT') != str(package):
        env = dict(os.environ, PYTHONPATH=str(package), CONTENT_FRAMEWORK_EVAL_RUNTIME_SNAPSHOT=str(package))
        return subprocess.run([sys.executable, __file__, *sys.argv[1:]], env=env).returncode

    # Direct bootstrap execution must not let this package's queue.py shadow
    # Python's stdlib queue module used by ThreadPoolExecutor.
    sys.path = [p for p in sys.path if Path(p or '.').resolve() != Path(__file__).resolve().parent]
    from content_production import segment_suggestion_provider as provider
    from content_production import framework_evals as evaluator
    MediaTape = load_file('_media_tape_adapter', Path(__file__).with_name('framework_eval_media.py')).MediaTape
    # Archived code predates the shared budget; keep the current host limiter
    # for fresh scene logs. This changes scheduling, never archived artifacts.
    budget_path = Path(__file__).with_name('local_media_budget.py')
    original = provider.run_media
    if budget_path.is_file() and not (package/'content_production/local_media_budget.py').exists():
        budget = load_file('_current_media_budget', budget_path)
        def bounded(command, env, tick, timeout, **kwargs):
            with budget.media_slot(command, tick, timeout) as command:
                return original(command, env, tick, timeout, **kwargs)
    else:
        bounded = original
    tape = MediaTape(args.output, bounded, reconstruct_from=archive)
    provider.run_media = tape.run
    sys.argv = ['framework_evals', 'run', '--corpus', str(archive/'corpus.json'),
                '--baseline', str(archive/'baseline.json'), '--sources', str(args.sources),
                '--output', str(args.output), '--films', args.films, '--cache', str(archive), '--workers', '2']
    certified, checks = False, []
    try:
        evaluator.main()
        for film in films:
            actual = json.loads((args.output/film/'run.json').read_text())
            expected = json.loads((archive/film/'run.json').read_text())
            calls = json.loads((args.output/film/'calls.json').read_text())
            old_calls = json.loads((archive/film/'calls.json').read_text())
            same = (not actual.get('error') and actual.get('pred') == expected.get('pred')
                    and actual.get('sourceSha256') == expected.get('sourceSha256')
                    and actual.get('rawResponseId') == expected.get('rawResponseId')
                    and [c['requestHash'] for c in calls] == [c['requestHash'] for c in old_calls]
                    and all(c.get('reused') for c in calls))
            checks.append(dict(film=film, reproduced=same, requests=len(calls)))
        certified = bool(checks) and all(c['reproduced'] for c in checks)
    finally:
        if args.output.exists():
            tape.save(certified=certified, provenance=dict(archive=str(archive), checks=checks,
                adapterSha256=hashlib.sha256(Path(__file__).with_name('framework_eval_media.py').read_bytes()).hexdigest()))
    print(json.dumps(dict(certified=certified, films=checks), ensure_ascii=False), flush=True)
    return 0 if certified else 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('archive', 'sources', 'output'):
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--films', required=True)
    raise SystemExit(reconstruct(parser.parse_args()))
