import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.execution import file_hash
from content_production.framework_harness.replay import load, main, replay_film, run, score

MANIFEST = Path(__file__).resolve().parents[1]/'fixtures/framework-evals/frozen-replay-v1.json'


def shot(a, b):
    return dict(start=a, end=b, facts=None, chain=None, ocr=[], bg_near=None, mouth=None)


def frozen_set(tmp_path, reference, baseline=None):
    data = tmp_path/'data'
    data.mkdir()
    case = dict(film='F', split='dev', duration=20, shots=[shot(0, 10), shot(10, 20)],
                review=[[0, 20, 'mixed_voiceover']], reference=reference)
    (data/'F.json').write_text(json.dumps(case, ensure_ascii=False))
    manifest = dict(schema='framework-frozen-replay-v1', films={'F': dict(split='dev', sha256=file_hash(data/'F.json'))})
    if baseline is not None:
        manifest['baseline'] = dict(pipelineVersion='old', films={'F': baseline})
    path = tmp_path/'manifest.json'
    path.write_text(json.dumps(manifest, ensure_ascii=False))
    return path, data


def test_score_skips_reference_boundaries_and_unscored_spans():
    ref = [[0, 10, '实拍内容'], [10, 20, '混剪口播']]
    assert score([[0, 20, '实拍内容']], ref) == pytest.approx(0.5, abs=0.01)
    assert score(ref, ref) == 1.0
    assert score([[0, 20, '混剪口播']], [[0, 10, None], [10, 20, '混剪口播']]) == 1.0


def test_replay_reclassifies_shots_then_finalizes_the_frozen_review():
    case = dict(shots=[shot(0, 10), shot(10, 20)], duration=20, review=[[0, 20, 'mixed_voiceover']])
    assert replay_film(case) == [[0, 20, '混剪口播']]
    assert 'kind' not in case['shots'][0]


def test_load_rejects_changed_inputs_and_foreign_manifests(tmp_path):
    path, data = frozen_set(tmp_path, [[0, 20, '混剪口播']])
    assert set(load(path, data)[1]) == {'F'}
    (data/'F.json').write_text('{}')
    with pytest.raises(ValueError, match='changed'):
        load(path, data)
    path.write_text(json.dumps(dict(schema='other', films={})))
    with pytest.raises(ValueError, match='manifest'):
        load(path, data)


def test_run_reports_deltas_regressions_and_triage_errors(tmp_path):
    path, data = frozen_set(tmp_path, [[0, 10, '实拍内容'], [10, 20, '混剪口播']], baseline=1.0)
    report, errors = run(*load(path, data))
    film = report['films'][0]
    assert film['score'] == pytest.approx(0.5, abs=0.01) and film['delta'] == pytest.approx(-0.5, abs=0.01)
    assert report['regressions'] == ['F'] and report['changed'] == ['F'] and report['baselineVersion'] == 'old'
    assert errors['films'][0]['errors'] == [dict(start=0, end=10, expected='实拍内容', actual='混剪口播')]


def test_cli_exits_nonzero_on_regression_and_refuses_to_overwrite(tmp_path, capsys):
    path, data = frozen_set(tmp_path, [[0, 10, '实拍内容'], [10, 20, '混剪口播']], baseline=1.0)
    out = tmp_path/'out'
    assert main(['--manifest', str(path), '--data', str(data), '--output', str(out)]) == 1
    assert json.loads((out/'report.json').read_text())['regressions'] == ['F']
    assert json.loads((out/'errors.json').read_text())['films'][0]['film'] == 'F'
    with pytest.raises(SystemExit):
        main(['--manifest', str(path), '--data', str(data), '--output', str(out)])
    (tmp_path/'clean').mkdir()
    path2, data2 = frozen_set(tmp_path/'clean', [[0, 20, '混剪口播']], baseline=1.0)
    assert main(['--manifest', str(path2), '--data', str(data2), '--output', str(tmp_path/'out2')]) == 0


def test_checked_in_manifest_pins_55_films_and_their_baseline():
    manifest = json.loads(MANIFEST.read_text())
    assert manifest['schema'] == 'framework-frozen-replay-v1' and len(manifest['films']) == 55
    assert all(len(e['sha256']) == 64 and e['split'] in ('dev', 'holdout') for e in manifest['films'].values())
    assert set(manifest['baseline']['films']) == set(manifest['films'])
    assert manifest['baseline']['means']['all'] == pytest.approx(0.9679, abs=1e-4)
