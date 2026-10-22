"""python -m content_production.framework_harness --help. Offline unless explicitly budgeted."""
import argparse
import os
import sys
from pathlib import Path

from .. import framework_eval_snapshot
from ..framework_eval_runtime import MODEL
from ..execution import file_hash
from .artifacts import BASELINE, Ledger, candidate, read, snapshot, write
from .runtime import Tape


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['capture', 'evaluate', 'optimize'])
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--capture', type=Path)
    parser.add_argument('--corpus', type=Path)
    parser.add_argument('--sources', type=Path)
    parser.add_argument('--films')
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--train')
    parser.add_argument('--validation')
    parser.add_argument('--tapes', type=Path, required=True)
    parser.add_argument('--ledger', type=Path, required=True)
    parser.add_argument('--max-new-calls', type=int, default=0,
                        help='Whole-experiment cap shared with capture, reflection and repetitions')
    parser.add_argument('--max-proposals', type=int, default=2)
    parser.add_argument('--max-metric-calls', type=int, default=24)
    parser.add_argument('--namespace', default='search', help='A new namespace forces fresh model sampling')
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--env-file', type=Path)
    args = parser.parse_args(argv)
    if args.live and args.max_new_calls <= 0:
        parser.error('--live requires a positive shared call budget')
    if not args.namespace.replace('-', '').replace('_', '').isalnum():
        parser.error('Unsafe tape namespace')
    if args.output.exists():
        parser.error('Use a new output directory; never overwrite an experiment')
    if not 1 <= args.max_proposals <= 20 or not 1 <= args.max_metric_calls <= 1000:
        parser.error('Invalid search budget')
    if args.action == 'capture' and (not args.corpus or not args.sources or not args.films or not args.live):
        parser.error('Capture needs corpus, sources, films and explicit live mode')
    if args.action != 'capture' and not args.capture:
        parser.error('Evaluation/search requires a completed capture')
    if args.action == 'optimize' and (not args.train or not args.validation):
        parser.error('Search requires explicit training and validation scopes')
    if args.action == 'evaluate' and not args.films:
        parser.error('Evaluation requires an explicit film scope')
    # Always execute a private recursive snapshot, including nested v2 and Harness packages.
    if not framework_eval_snapshot.is_snapshot():
        return framework_eval_snapshot.run(sys.argv[1:] if argv is None else argv,
                                          module='content_production.framework_harness')
    if args.env_file:
        from dotenv import load_dotenv
        load_dotenv(args.env_file)
    os.environ['CONTENT_AI_STUDIO_SEGMENT_SUGGEST_LIVE'] = '1' if args.live else '0'
    os.environ['ARK_CONTENT_ANALYSIS_MODEL'] = MODEL
    tape = Tape(args.tapes, Ledger(args.ledger, args.max_new_calls), live=args.live, namespace=args.namespace)
    try:
        from .evaluate import Evaluator, capture
        if args.action == 'capture':
            capture(args.corpus, args.sources, args.films.split(','), args.output, tape)
        else:
            args.output.mkdir(parents=True)
            evaluator = Evaluator(args.capture, args.output, tape)
            write(args.output/'manifest.json', dict(schema='framework-harness-experiment-v1',
                captureManifestSha256=file_hash(args.capture/'manifest.json'), action=args.action,
                live=args.live, model=MODEL, namespace=args.namespace, maxNewCalls=args.max_new_calls,
                maxProposals=args.max_proposals, maxMetricCalls=args.max_metric_calls,
                train=args.train, validation=args.validation, films=args.films, **snapshot(args.output)))
            if args.action == 'evaluate':
                value = candidate(read(args.candidate)) if args.candidate else BASELINE
                scope = args.films.split(',')
                if len(scope) != len(set(scope)) or not set(scope) <= set(evaluator.manifest['scope']):
                    raise ValueError('Evaluation scope is not captured')
                rows = [evaluator.one(f, value) for f in scope]
                write(args.output/'report.json', evaluator.score(rows, scope))
                write(args.output/'candidate.json', value)
            else:
                from .optimize import search
                train, validation = args.train.split(','), args.validation.split(',')
                if not set(train + validation) <= set(evaluator.manifest['scope']):
                    raise ValueError('Search scope is not captured')
                search(evaluator, train, validation, max_proposals=args.max_proposals,
                       max_metric_calls=args.max_metric_calls)
        return 0
    except Exception as error:
        # Model/HTTP exceptions may include private request data. Retain types, not text.
        from ..framework_evals import failure_location
        write(args.output/'failure.json', dict(error=type(error).__name__, code=getattr(error, 'code', None),
                                               locations=failure_location(error)))
        print(f'Harness stopped: {type(error).__name__}; see failure.json', file=sys.stderr)
        return 1
    finally:
        if args.output.exists():
            write(args.output/'calls.json', tape.calls)
        tape.close()


if __name__ == '__main__':
    sys.exit(main())
