"""Rank scorer errors by kind and link them to the case registry. Reads scorer output only; never imports the classifier.

    python -m content_production.framework_harness.triage REPORT.json [...] --registry case-registry.json --output NEW_DIR

REPORT is a strict-scorer report (`films[*].errors`) or any file with the same shape. Errors a registered case
already explains are counted apart, so what is left in `unexplained` is the work that still needs a decision.
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

STATUSES = ('open', 'ruled', 'implemented', 'deferred')
KINDS = ('question', 'ruling', 'deviation')
PROMOTION, STREET, LIVE, MIXED = '机制', '街采', '实拍内容', '混剪口播'
KIND_NAMES = {
    'mixed_as_live': '混剪判成实拍', 'live_as_mixed': '实拍判成混剪',
    'promotion_boundary': '机制起止偏', 'street_mismatch': '街采误判',
}


def error_kind(error):
    pair = {error['expected'], error['actual']}
    if PROMOTION in pair:
        return 'promotion_boundary'
    if STREET in pair:
        return 'street_mismatch'
    if (error['expected'], error['actual']) == (MIXED, LIVE):
        return 'mixed_as_live'
    if (error['expected'], error['actual']) == (LIVE, MIXED):
        return 'live_as_mixed'
    return f"{error['expected']}->{error['actual']}"


def load_cases(path):
    cases = json.loads(Path(path).read_text())
    seen = set()
    for case in cases:
        missing = {'id', 'status', 'kind', 'summary'} - set(case)
        if missing:
            raise ValueError(f"Case {case.get('id')} lacks {sorted(missing)}")
        if case['id'] in seen:
            raise ValueError(f"Duplicate case id {case['id']}")
        seen.add(case['id'])
        if case['status'] not in STATUSES or case['kind'] not in KINDS:
            raise ValueError(f"Case {case['id']} has an unknown status or kind")
        if ('start' in case) != ('end' in case) or ('start' in case and 'film' not in case):
            raise ValueError(f"Case {case['id']} needs film with both start and end, or neither")
        if 'start' in case and not case['start'] < case['end']:
            raise ValueError(f"Case {case['id']} has an empty range")
    return cases


def explains(case, film, error):
    return ('start' in case and case['film'] == film
            and case['start'] < error['end'] and error['start'] < case['end'])


def triage(rows, cases=()):
    kinds = defaultdict(lambda: dict(seconds=0, spans=0, films=defaultdict(int), explained=0, adjudicated=0))
    unexplained, observed = [], set()
    for row in rows:
        for error in row.get('errors', []):
            seconds = error['end'] - error['start']
            entry = kinds[error_kind(error)]
            entry['seconds'] += seconds
            entry['spans'] += 1
            entry['films'][row['film']] += seconds
            linked = [c['id'] for c in cases if explains(c, row['film'], error)]
            observed.update(linked)
            if error.get('resolvedByAdjudications'):
                entry['adjudicated'] += seconds
            elif linked:
                entry['explained'] += seconds
            else:
                unexplained.append(dict(film=row['film'], start=error['start'], end=error['end'],
                                        expected=error['expected'], actual=error['actual'], seconds=seconds))
    ranked = [dict(kind=k, name=KIND_NAMES.get(k, k), seconds=v['seconds'], spans=v['spans'],
                   explainedSeconds=v['explained'], adjudicatedSeconds=v['adjudicated'],
                   unexplainedSeconds=v['seconds'] - v['explained'] - v['adjudicated'],
                   films=sorted(({'film': f, 'seconds': s} for f, s in v['films'].items()),
                                key=lambda x: (-x['seconds'], x['film'])))
              for k, v in kinds.items()]
    ranked.sort(key=lambda x: (-x['unexplainedSeconds'], -x['seconds'], x['kind']))
    # A ruled case no error touches any more is either fixed or a stale range; a film-less case cannot be matched.
    unmatched = [c['id'] for c in cases if 'start' in c and c['id'] not in observed]
    return dict(totalErrorSeconds=sum(k['seconds'] for k in ranked), kinds=ranked,
                unexplained=sorted(unexplained, key=lambda e: (-e['seconds'], e['film'], e['start'])),
                openCases=[c['id'] for c in cases if c['status'] == 'open'],
                casesWithoutErrors=unmatched)


def render(result):
    lines = [f"# 错误归类\n\n总错误 {result['totalErrorSeconds']} 秒；按未解释秒数排序。\n",
             '| 类型 | 总秒数 | 已有登记解释 | 业务裁决覆盖 | 未解释 | 涉及片子（秒） |', '|---|---|---|---|---|---|']
    for k in result['kinds']:
        films = '、'.join(f"{f['film']} {f['seconds']}" for f in k['films'][:6])
        lines.append(f"| {k['name']} | {k['seconds']} | {k['explainedSeconds']} | {k['adjudicatedSeconds']} | "
                     f"{k['unexplainedSeconds']} | {films} |")
    lines += ['', '## 未解释的错误段（前 20）', '', '| 片子 | 区间 | 期望 → 实际 | 秒 |', '|---|---|---|---|']
    lines += [f"| {e['film']} | {e['start']}–{e['end']} | {e['expected']} → {e['actual']} | {e['seconds']} |"
              for e in result['unexplained'][:20]]
    lines += ['', f"待确认登记项：{', '.join(result['openCases']) or '无'}",
              f"登记了区间但本次没有对应错误：{', '.join(result['casesWithoutErrors']) or '无'}", '']
    return '\n'.join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reports', type=Path, nargs='+')
    parser.add_argument('--registry', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    if args.output.exists():
        parser.error('Use a new output directory; never overwrite a triage')
    rows = [row for path in args.reports for row in json.loads(path.read_text())['films']]
    result = triage(rows, load_cases(args.registry) if args.registry else ())
    args.output.mkdir(parents=True)
    (args.output/'triage.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (args.output/'triage.md').write_text(render(result))
    print(render(result))
    return 0


if __name__ == '__main__':
    sys.exit(main())
