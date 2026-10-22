"""Run: python -m content_production.framework_evals --help (offline by default)."""
import argparse
import concurrent.futures
import json
import os
import shutil
import sys
import time
import traceback
from pathlib import Path
from unittest.mock import patch

from .execution import file_hash
from .framework_eval_runtime import Budget, MODEL, RecordingProvider
from .framework_eval_report import write_report


def read(path):
    return json.loads(Path(path).read_text())


def scope_for(corpus, films):
    scope = films.split(',') if films else sorted(corpus['films'])
    if (not scope or len(scope) != len(set(scope)) or not set(scope) <= set(corpus['films'])
            or any('/' in f or '\\' in f or f in ('.', '..') for f in scope)):
        raise ValueError('Unknown, duplicate or unsafe evaluation film')
    return scope


def failure_location(error):
    """Keep causal code locations, never exception locals or credential text."""
    root = Path(__file__).resolve().parent.parent
    result, seen = [], set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        locations = []
        for frame in traceback.extract_tb(error.__traceback__):
            path = Path(frame.filename).resolve()
            if path.is_relative_to(root):
                locations.append(dict(file=str(path.relative_to(root)), line=frame.lineno, function=frame.name))
        result.append(dict(error=type(error).__name__, locations=locations))
        error = error.__cause__
    return result


def proposal_trace(calls, publication=None):
    """Use the proposal actually consumed, including bounded completion/retry.

    The first receipt may be an incomplete output or a discarded degenerate
    proposal. Neither is evidence of what the downstream verifier received.
    """
    response_id = (publication or {}).get('summary', {}).get('responseId')
    if response_id is not None:
        matches = [c for c in calls if c.get('responseId') == response_id
                   and isinstance(c.get('payload', {}).get('segments'), list)]
        if not matches:
            raise ValueError('Published proposal lacks its source receipt')
        chosen = matches[-1]
    else:
        chosen = None
        for call in calls:
            if call.get('code') == 'provider_incomplete' and 'payload' not in call:
                continue
            if not isinstance(call.get('payload', {}).get('segments'), list):
                break  # An audit response cannot replace the initial proposal.
            chosen = call
        if chosen is None:
            return {}
    return dict(raw=chosen['payload']['segments'], rawResponseId=chosen.get('responseId'))


def run(args):
    from . import segment_suggestion_worker as worker
    corpus, baseline = read(args.corpus), read(args.baseline)
    scope = scope_for(corpus, args.films)
    if args.output.exists():
        raise ValueError('Use a new output directory; never overwrite an experiment')
    if args.live != (args.max_new_calls > 0):
        raise ValueError('Live runs require --live and an explicit positive --max-new-calls')
    # Validate all source identities before any paid request.
    for film in scope:
        entry = corpus['films'][film]
        source = (args.sources/entry['file']).resolve()
        if not source.is_relative_to(args.sources.resolve()) or file_hash(source) != entry['sourceSha256']:
            raise ValueError('Source changed or escaped root: ' + film)
    if args.env_file:
        from dotenv import load_dotenv
        load_dotenv(args.env_file)
    os.environ.update(corpus['environment'])
    os.environ['CONTENT_AI_STUDIO_SEGMENT_SUGGEST_LIVE'] = '1' if args.live else '0'
    args.output.mkdir(parents=True)
    code = {}
    package = Path(__file__).parent
    # Snapshot every runtime Python dependency in these two local packages.
    for folder in (package, package.parent/'marketing_content_assets'):
        for path in folder.rglob('*.py'):
            target = args.output/'code'/folder.name/path.relative_to(folder)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            code[str(path.relative_to(package.parent))] = file_hash(path)
    shutil.copy2(package/'segment_suggestion_provider.py', args.output/'segment_suggestion_provider.py')
    shutil.copy2(args.corpus, args.output/'corpus.json')
    shutil.copy2(args.baseline, args.output/'baseline.json')
    from . import framework_eval_snapshot
    manifest = dict(schema='framework-evals-v1', runtimeSnapshot=framework_eval_snapshot.is_snapshot(), scope=scope, model=MODEL, code=code,
        corpusSha256=file_hash(args.corpus), baselineSha256=file_hash(args.baseline),
        configuration=worker.suggest_config(), labels=corpus['labels'],
        mode='real worker; local database adapters; exact request replay or explicitly budgeted Lite calls',
        cacheRoots=[str(p.resolve()) for p in args.cache], live=args.live,
        maxNewCalls=args.max_new_calls, perFilmCalls=args.per_film_calls, workers=args.workers)
    manifest['mediaCacheRoots'] = [str(p.resolve()) for p in args.media_cache]
    manifest['mediaMode'] = 'certified frozen-media replay with bounded fresh misses' if args.media_cache else 'fresh media'
    (args.output/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    budget = Budget(args.max_new_calls)
    sources, publications = {}, {}
    names = {s['key']: s['name'] for s in corpus['labels']}

    class Conn:
        def rollback(self):
            pass

    def record(conn, job, model, version, settings):
        (args.output/job['film']/'request.json').write_text(json.dumps(dict(model=model, version=version, settings=settings)))

    def publish(conn, job, source, segments, **kwargs):
        publications[job['film']] = dict(segments=segments, **{k:v for k,v in kwargs.items() if k != 'inserted'})
        return True

    def one(film):
        work = args.output/film
        work.mkdir()
        entry = corpus['films'][film]
        source = (args.sources/entry['file']).resolve()
        row = dict(film=film, sourceFile=str(source))
        provider, started = None, time.monotonic()
        try:
            row['sourceSha256'] = file_hash(source)
            if row['sourceSha256'] != entry['sourceSha256']:
                raise ValueError('Source changed after evaluation preflight')
            from .framework_eval_extent import observe
            row['sourceVideoExtent'] = observe(source, row['sourceSha256'], dict(os.environ))
            provider = RecordingProvider(work, args.cache, budget, args.live, args.per_film_calls)
            sources[film] = dict(objectKey=entry['file'], durationMs=None, labels=corpus['labels'],
                                 presetName='框架 v2', presetDimension='framework')
            job = dict(film=film, source_content_hash=entry['sourceSha256'], request_settings={'labelKeys': list(names)})
            config = worker.suggest_config()
            worker.suggest(Conn(), job, provider, worker.LocalSource(args.sources), work,
                min_ms=config['minMs'], proxy_limit=128*1024*1024,
                prompt_version=config['promptVersion'], shots=config['shots'], snap=config['snap'])
            publication = publications[film]
            row.update(pred=[[s['start_ms']/1000, s['end_ms']/1000, names[s['label_key']]]
                             for s in publication['segments']], publication=publication)
        except Exception as error:
            row.update(error=type(error).__name__, code=getattr(error, 'code', None),
                failureLocation=failure_location(error),
                message=str(error) if isinstance(error, (ValueError, worker.SuggestionError)) else 'unexpected_error',
                cause=str(error.__cause__) if isinstance(error.__cause__, ValueError) else None)
        finally:
            if provider:
                try:
                    row.update(proposal_trace(provider.calls, row.get('publication')))
                finally:
                    provider.close()
            row['seconds'] = round(time.monotonic()-started, 2)
            (work/'run.json').write_text(json.dumps(row, ensure_ascii=False, indent=2))
            # Only this evaluator's copied source; original remains untouched.
            (work/'source.mp4').unlink(missing_ok=True)
        return row

    rows = []
    with patch.object(worker, 'load_source', lambda conn,job: sources[job['film']]), \
         patch.object(worker, 'heartbeat', lambda *a: None), \
         patch.object(worker, 'record_request', record), patch.object(worker, 'publish', publish):
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            pending = {pool.submit(one, f): f for f in scope}
            for future in concurrent.futures.as_completed(pending):
                try:
                    row = future.result()
                except Exception as error:
                    row = dict(film=pending[future], error=type(error).__name__, message='unexpected_evaluator_error',
                               failureLocation=failure_location(error))
                    work = args.output/row['film']
                    work.mkdir(exist_ok=True)
                    (work/'run.json').write_text(json.dumps(row, ensure_ascii=False, indent=2))
                rows.append(row)
                (args.output/'runs.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2))
                print(json.dumps(dict(film=row['film'], completed='pred' in row,
                    cause=row.get('cause') or row.get('message'), newCalls=budget.used), ensure_ascii=False), flush=True)
    # Code edits during a long run invalidate the batch instead of blending versions.
    changed = [name for name, sha in code.items() if not (package.parent/name).is_file()
               or file_hash(package.parent/name) != sha]
    manifest['codeChangedDuringRun'] = changed
    manifest['providerCircuitOpen'] = budget.provider_unavailable
    (args.output/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    result = generate(args.output)
    if changed:
        raise ValueError('Code changed during evaluation; batch is invalid')
    return result


def generate(output):
    manifest = read(output/'manifest.json')
    for name, field in (('corpus.json', 'corpusSha256'), ('baseline.json', 'baselineSha256')):
        if file_hash(output/name) != manifest[field]:
            raise ValueError('Frozen evaluation reference changed: ' + name)
    for name, sha in manifest['code'].items():
        if file_hash(output/'code'/name) != sha:
            raise ValueError('Archived evaluation code changed: ' + name)
    calls = [c for p in output.glob('*/calls.json') for c in read(p)]
    result = write_report(output, read(output/'corpus.json'), read(output/'baseline.json'),
                          read(output/'runs.json'), manifest['scope'], calls)
    if manifest.get('codeChangedDuringRun'):
        raise ValueError('Code changed during evaluation; use the invalid report only for diagnosis')
    print(json.dumps({k:result[k] for k in ('adoptionPassed', 'scopedPassed', 'evaluated', 'candidateMean', 'usage')},
                     ensure_ascii=False), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    run_parser = sub.add_parser('run')
    for name in ('corpus', 'baseline', 'sources', 'output'):
        run_parser.add_argument('--'+name, type=Path, required=True)
    run_parser.add_argument('--films')
    run_parser.add_argument('--cache', type=Path, action='append', default=[])
    run_parser.add_argument('--media-cache', type=Path, action='append', default=[])
    run_parser.add_argument('--live', action='store_true')
    run_parser.add_argument('--max-new-calls', type=int, default=0)
    run_parser.add_argument('--per-film-calls', type=int, default=80)
    run_parser.add_argument('--workers', type=int, choices=range(1,7), default=4)
    run_parser.add_argument('--env-file', type=Path)
    report_parser = sub.add_parser('report')
    report_parser.add_argument('output', type=Path)
    args = parser.parse_args()
    from . import framework_eval_snapshot
    if args.command == 'run' and not framework_eval_snapshot.is_snapshot():
        return framework_eval_snapshot.run(sys.argv[1:])
    if args.command == 'run' and args.media_cache:
        if args.output.exists():
            raise ValueError('Use a new output directory; never overwrite an experiment')
        from . import segment_suggestion_provider as provider
        from .framework_eval_media import MediaTape
        tape = MediaTape(args.output, provider.run_media, args.media_cache)
        try:
            with patch.object(provider, 'run_media', tape.run):
                result = run(args)
        finally:
            if args.output.exists():
                tape.save(certified=True, provenance=dict(mode='logical command and input hashes',
                    roots=[str(p.resolve()) for p in args.media_cache]))
    else:
        result = run(args) if args.command == 'run' else generate(args.output)
    return 0 if result['adoptionPassed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
