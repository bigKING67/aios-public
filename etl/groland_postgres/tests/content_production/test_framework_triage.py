import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_harness.triage import error_kind, explains, load_cases, main, triage

REGISTRY = Path(__file__).resolve().parents[4]/'.trellis/tasks/10-18-framework-split-v2/case-registry.json'


def err(start, end, expected, actual, **extra):
    return dict(start=start, end=end, expected=expected, actual=actual, **extra)


def case(**fields):
    return {**dict(id='C1', status='open', kind='question', summary='s'), **fields}


def test_error_kind_groups_label_pairs():
    assert error_kind(err(0, 1, '混剪口播', '实拍内容')) == 'mixed_as_live'
    assert error_kind(err(0, 1, '实拍内容', '混剪口播')) == 'live_as_mixed'
    assert error_kind(err(0, 1, '混剪口播', '机制')) == 'promotion_boundary'
    assert error_kind(err(0, 1, '机制', '实拍内容')) == 'promotion_boundary'
    assert error_kind(err(0, 1, '街采', '混剪口播')) == 'street_mismatch'


def test_triage_ranks_by_unexplained_seconds_and_separates_explained_and_adjudicated():
    rows = [
        dict(film='A', errors=[err(10, 40, '混剪口播', '实拍内容'), err(50, 60, '实拍内容', '混剪口播')]),
        dict(film='B', errors=[err(0, 20, '混剪口播', '实拍内容', resolvedByAdjudications=[1]),
                               err(30, 38, '混剪口播', '机制')]),
    ]
    result = triage(rows, [case(film='A', start=20, end=30)])
    assert result['totalErrorSeconds'] == 68
    first = next(k for k in result['kinds'] if k['kind'] == 'mixed_as_live')
    assert (first['seconds'], first['explainedSeconds'], first['adjudicatedSeconds']) == (50, 30, 20)
    assert first['unexplainedSeconds'] == 0
    assert [k['kind'] for k in result['kinds']] == ['live_as_mixed', 'promotion_boundary', 'mixed_as_live']
    assert [(e['film'], e['seconds']) for e in result['unexplained']] == [('A', 10), ('B', 8)]
    assert first['films'] == [{'film': 'A', 'seconds': 30}, {'film': 'B', 'seconds': 20}]


def test_cases_report_open_ones_and_ranges_no_error_touches():
    result = triage([dict(film='A', errors=[err(0, 5, '混剪口播', '实拍内容')])],
                    [case(), dict(case(), id='C2', status='ruled', film='A', start=100, end=110),
                     dict(case(), id='C3', status='ruled', film='A', start=0, end=2)])
    assert result['openCases'] == ['C1']
    assert result['casesWithoutErrors'] == ['C2']


def test_explains_needs_same_film_and_overlap():
    c = case(film='A', start=10, end=20)
    assert explains(c, 'A', err(19, 25, 'x', 'y'))
    assert not explains(c, 'A', err(20, 25, 'x', 'y'))
    assert not explains(c, 'B', err(10, 20, 'x', 'y'))
    assert not explains(case(), 'A', err(10, 20, 'x', 'y'))


@pytest.mark.parametrize('bad', [
    dict(status='nope'), dict(kind='nope'), dict(film='A', start=5), dict(start=1, end=2),
    dict(film='A', start=5, end=5),
])
def test_load_cases_rejects_inconsistent_entries(tmp_path, bad):
    path = tmp_path/'cases.json'
    path.write_text(json.dumps([case(**bad)]))
    with pytest.raises(ValueError):
        load_cases(path)


def test_load_cases_rejects_duplicates_and_missing_fields(tmp_path):
    path = tmp_path/'cases.json'
    path.write_text(json.dumps([case(), case()]))
    with pytest.raises(ValueError, match='Duplicate'):
        load_cases(path)
    path.write_text(json.dumps([dict(id='C1')]))
    with pytest.raises(ValueError, match='lacks'):
        load_cases(path)


def test_checked_in_registry_is_valid():
    assert {c['id'] for c in load_cases(REGISTRY)} >= {'Q-accumulate', 'R-koc'}


def test_cli_writes_a_new_directory_and_refuses_to_overwrite(tmp_path, capsys):
    report = tmp_path/'report.json'
    report.write_text(json.dumps(dict(films=[dict(film='A', errors=[err(0, 12, '混剪口播', '实拍内容')])])))
    out = tmp_path/'triage'
    assert main([str(report), '--registry', str(REGISTRY), '--output', str(out)]) == 0
    saved = json.loads((out/'triage.json').read_text())
    assert saved['totalErrorSeconds'] == 12 and saved['unexplained'][0]['film'] == 'A'
    assert '混剪判成实拍' in (out/'triage.md').read_text()
    with pytest.raises(SystemExit):
        main([str(report), '--output', str(out)])
