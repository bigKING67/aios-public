"""Offline regression replay of the shipped rules on a frozen film set. Zero model calls.

    python -m content_production.framework_harness.replay --manifest frozen-replay-v1.json --data DIR --output NEW_DIR

Each film file holds the raw shots, the frozen Lite-review timeline and the business reference. The replay reruns
rules.segment() only for the per-shot kind/offer that finalize() reads, then applies finalize() to the frozen review
timeline: it tests finalize-stage and shot-classification changes, not segment() boundaries or the review itself.
Writes report.json (scores and per-film deltas against the manifest baseline) and errors.json in the scorer-report
shape for framework_harness.triage. Exits 1 when a film drops more than --max-film-regression.
"""
import argparse
import copy
import json
import statistics
import sys
from pathlib import Path

from ..execution import file_hash
from ..framework_eval_report import error_spans
from ..framework_v2 import rules
from ..framework_v2.pipeline import PIPELINE_VERSION

NAMES = {rules.MIXED: '混剪口播', rules.LIVE: '实拍内容', rules.STREET: '街采', rules.PROMOTION: '机制'}


def score(pred, ref):
    """Share of 0.1s samples whose label matches the reference. Samples within 0.5s of a reference boundary and
    unlabelled (None) reference spans are not scored. This is the scorer of the 2026-10-19 business-answer
    baseline (research/p5/business_reference.py), kept so replay scores stay comparable with those records."""
    bounds = [s[0] for s in ref[1:]]

    def at(segs, t):
        for a, b, label in segs:
            if a <= t < b:
                return label
        return segs[-1][2]

    hit = total = 0
    t = 0.05
    while t < ref[-1][1]:
        want = at(ref, t)
        if want is not None and all(abs(t - x) > 0.5 for x in bounds):
            total += 1
            hit += at(pred, t) == want
        t += 0.1
    return hit / total if total else None


def load(manifest_path, data_dir):
    manifest = json.loads(Path(manifest_path).read_text())
    if manifest.get('schema') != 'framework-frozen-replay-v1':
        raise ValueError('Not a frozen replay manifest')
    cases = {}
    for film, entry in manifest['films'].items():
        path = Path(data_dir)/f'{film}.json'
        if file_hash(path) != entry['sha256']:
            raise ValueError(f'Frozen replay input changed: {film}')
        cases[film] = json.loads(path.read_text())
    return manifest, cases


def replay_film(case):
    shots = copy.deepcopy(case['shots'])
    rules.segment(shots, case['duration'])
    final = rules.finalize([list(s) for s in case['review']], shots)
    return [[a, b, NAMES[label]] for a, b, label in final]


def run(manifest, cases, max_film_regression=0.1):
    baseline = manifest.get('baseline', {}).get('films', {})
    films, errors = [], []
    for film, case in sorted(cases.items()):
        pred = replay_film(case)
        value = score(pred, case['reference'])
        before = baseline.get(film)
        films.append(dict(film=film, split=case['split'], score=value, baseline=before,
                          delta=None if before is None else value - before))
        errors.append(dict(film=film, errors=error_spans([s for s in case['reference'] if s[2] is not None], pred)))

    def mean(split=None):
        values = [f['score'] for f in films if split in (None, f['split'])]
        return statistics.mean(values) if values else None

    return dict(pipelineVersion=PIPELINE_VERSION, baselineVersion=manifest.get('baseline', {}).get('pipelineVersion'),
                means=dict(dev=mean('dev'), holdout=mean('holdout'), all=mean()),
                regressions=[f['film'] for f in films if f['delta'] is not None and f['delta'] < -max_film_regression],
                changed=[f['film'] for f in films if f['delta'] is not None and abs(f['delta']) > 0.005],
                films=films), dict(films=errors)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--max-film-regression', type=float, default=0.1)
    args = parser.parse_args(argv)
    if args.output.exists():
        parser.error('Use a new output directory; never overwrite a replay')
    manifest, cases = load(args.manifest, args.data)
    report, errors = run(manifest, cases, args.max_film_regression)
    args.output.mkdir(parents=True)
    (args.output/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    (args.output/'errors.json').write_text(json.dumps(errors, ensure_ascii=False) + '\n')
    means = ' '.join(f'{k} {"-" if v is None else f"{v:.4f}"}' for k, v in report['means'].items())
    print(f"{report['pipelineVersion']}: {means} (baseline {report['baselineVersion']});"
          f" changed {len(report['changed'])}, regressions {report['regressions']}")
    return 1 if report['regressions'] else 0


if __name__ == '__main__':
    sys.exit(main())
