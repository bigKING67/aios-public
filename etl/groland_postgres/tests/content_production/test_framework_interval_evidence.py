import copy
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def modules(monkeypatch):
    path = Path(__file__).resolve().parents[4]/'.trellis/tasks/10-18-framework-split-v2/research/harness'
    monkeypatch.syspath_prepend(str(path))
    import interval_evidence
    import interval_probe
    return interval_evidence, interval_probe


def unit(group='A'):
    return dict(id='fixture-'+group, group=group,
                frames=[dict(seconds=i/30, sourceSeconds=10+i/30, rgbSha256=str(i)) for i in range(16)])


def observation(frames=None):
    return dict(observations=[dict(kind='clothing', description='白色衣袖', frames=frames or [1, 6])], limitations='')


def facts_and_judge(c):
    facts = [f for g in ('A', 'B', 'C') for f in c.observations(observation(), unit(g), 'images')]
    payload = {edge: dict(relation='same_review', citations=[dict(left=left+'.images.1', right=right+'.images.1')],
                         reason='可见衣袖相容，但测试不证明真实同源') for edge, (left, right) in c.PAIRS.items()}
    return facts, payload


@pytest.mark.parametrize('frames', [[2], [0], [17], [1, 1], [True], [1.0]])
def test_reject_frame_not_in_actual_image_input(modules, frames):
    c, _ = modules
    with pytest.raises(ValueError, match='frame citation'):
        c.observations(observation(frames), unit(), 'images')


def test_modes_have_distinct_observation_roles_and_source_anchors(modules):
    c, _ = modules
    value = observation()
    assert c.observations(value, unit(), 'images')[0]['anchors'][1]['sourceSeconds'] == 10+5/30
    with pytest.raises(ValueError):
        c.observations(value, unit(), 'video')
    value['observations'][0]['kind'] = 'action'
    value['observations'][0]['frames'] = [2, 15]
    assert len(c.observations(value, unit(), 'video')[0]['anchors']) == 2


@pytest.mark.parametrize('side,bad', [('left', 'C.images.1'), ('right', 'B.images.99'), ('left', 'B.images.1')])
def test_cannot_import_another_intervals_fact_into_pair(modules, side, bad):
    c, _ = modules
    facts, payload = facts_and_judge(c)
    payload['a_to_b']['citations'][0][side] = bad
    with pytest.raises(ValueError, match='Cross-interval'):
        c.judgement(payload, facts)


def test_unreviewed_or_wrong_visual_claim_never_promotes(modules):
    c, _ = modules
    facts, payload = facts_and_judge(c)
    intervals = [[0, 1], [1, 2], [2, 3]]
    assert c.advisory(payload, facts, None, intervals, [1, 2])['status'] == 'abstain'
    review = dict(factsSha256=c.digest(facts), claims={f['id']: 'supported' for f in facts})
    assert c.advisory(payload, facts, review, intervals, [1, 2])['status'] == 'advisory'
    review['claims']['A.images.1'] = 'unsupported'
    assert not c.advisory(payload, facts, review, intervals, [1, 2])['evidencePassed']
    del review['claims']['A.images.1']
    assert not c.advisory(payload, facts, review, intervals, [1, 2])['evidencePassed']
    review['claims']['A.images.1'] = 'supported'
    facts[0]['description'] = '手工改写事实不能沿用审核'
    assert not c.advisory(payload, facts, review, intervals, [1, 2])['evidencePassed']


def test_relations_remain_consistent_and_cuts_are_physical(modules):
    c, _ = modules
    facts, payload = facts_and_judge(c)
    review = dict(factsSha256=c.digest(facts), claims={f['id']: 'supported' for f in facts})
    payload['a_to_b']['relation'] = 'independent_material'
    intervals = [[0, 1], [1, 2], [2, 3]]
    assert 'relations_unresolved' in c.advisory(payload, facts, review, intervals, [1, 2])['reasons']
    payload['a_to_c']['relation'] = 'independent_material'
    assert c.advisory(payload, facts, review, intervals, [1, 2])['candidateBoundaries'] == [1]
    assert 'missing_physical_cut' in c.advisory(payload, facts, review, intervals, [2])['reasons']


def test_judge_uses_only_observations_not_expected_or_media_names(modules):
    c, _ = modules
    facts, _ = facts_and_judge(c)
    prompt = c.judge_input(facts, {'A.images': '只见部分袖口'})
    assert '蜜粉-015' not in prompt and 'expected' not in prompt and 'score' not in prompt
    assert 'sourceSeconds' in prompt and 'A.images.1' in prompt


@pytest.mark.parametrize('invalid', [False, True])
def test_raw_response_saved_before_validation_and_no_retry(modules, tmp_path, monkeypatch, invalid):
    _, p = modules
    p.write(tmp_path/'plan.json', {'frozen': True})
    p.write(tmp_path/'local-calls.json', {'maximum': 14, 'calls': []})
    key = tmp_path/'.config/aios/desktop-vlm.key'
    key.parent.mkdir(parents=True)
    key.write_text('test-only-key')
    monkeypatch.setattr(p.Path, 'home', lambda: tmp_path)
    monkeypatch.setattr(p, 'frozen', lambda _: {})
    monkeypatch.setattr(p, 'live_health', lambda: {'serveSha256': 'test-runtime'})
    for name in ('FRAMEWORK_V2_VLM_BASE_URL', 'FRAMEWORK_V2_VLM_API_KEY'):
        monkeypatch.setenv(name, '')
    requests = []
    def post(*args, **kwargs):
        requests.append(kwargs['json'])
        return SimpleNamespace(status_code=200, raise_for_status=lambda: None,
            json=lambda: {'choices': [{'message': {'content': json.dumps({'raw': 'retained'})}}]})
    monkeypatch.setattr(p.local_vlm, 'LocalVlm', lambda: SimpleNamespace(model='test-model',
        session=SimpleNamespace(post=post, close=lambda: None)))
    def validate(payload):
        if invalid: raise ValueError('bad observation')
    args = (tmp_path, 'A-images', 'fixed prompt', {}, [], [], validate)
    if invalid:
        with pytest.raises(RuntimeError, match='retained receipt'):
            p.execute(*args)
        with pytest.raises(ValueError, match='no automatic retry'):
            p.execute(*args)
    else:
        p.execute(*args)
        p.execute(*args)
    receipt = p.read(tmp_path/'responses/A-images.json')
    assert json.loads(receipt['response']['choices'][0]['message']['content']) == {'raw': 'retained'}
    assert len(requests) == len(p.read(tmp_path/'local-calls.json')['calls']) == 1
    if not invalid:
        receipt['response']['choices'][0]['message']['content'] = '{}'
        p.write(tmp_path/'responses/A-images.json', receipt)
        with pytest.raises(ValueError): p.checked_receipt(tmp_path/'responses/A-images.json')


def test_frozen_decode_proof_cannot_be_replaced(modules, tmp_path):
    c, p = modules
    p.write(tmp_path/'decoder-proof.json', {'actualFrames': 16})
    p.write(tmp_path/'plan.json', dict(maximum=14, version=c.VERSION, code={},
        frozen={'decoder-proof.json': p.file_hash(tmp_path/'decoder-proof.json')}))
    p.frozen(tmp_path)
    p.write(tmp_path/'decoder-proof.json', {'actualFrames': 8})
    with pytest.raises(ValueError, match='Frozen inputs changed'):
        p.frozen(tmp_path)


def test_single_frame_times_are_host_owned_and_empty_is_not_a_claim(modules):
    import single_frame_probe as s
    payload = dict.fromkeys(s.FIELDS)
    payload['clothing'] = '金色上衣'
    facts = s.observation(payload, unit())
    assert len(facts) == 1
    assert facts[0]['anchors'] == [dict(frame=6, sourceSeconds=10+5/30, rgbSha256='5')]
    payload['frames'] = [1]
    with pytest.raises(ValueError): s.observation(payload, unit())


def test_relation_call_refused_before_all_visual_facts_pass(modules, tmp_path, monkeypatch):
    import single_frame_probe as s
    c, p = modules
    facts, _ = facts_and_judge(c)
    p.write(tmp_path/'units.json', [dict(case='m015-tail')]*3)
    p.write(tmp_path/'m015-tail-review.json', dict(factsSha256=c.digest(facts),
        claims={f['id']: 'unsupported' for f in facts}))
    monkeypatch.setattr(p, 'frozen', lambda _: {})
    monkeypatch.setattr(s, 'gather', lambda *_: (facts, ['hash']))
    monkeypatch.setattr(p, 'execute', lambda *_: pytest.fail('Should not spend a judgement call'))
    with pytest.raises(ValueError, match='visual review'):
        s.run(SimpleNamespace(output=tmp_path, case='m015-tail', stage='judge'))


def test_revision_budget_keeps_prior_attempts(modules, tmp_path):
    _, p = modules
    ledger = tmp_path/'original/ledger.json'
    budget = p.Ledger(ledger, 14)
    for i in range(4): budget.reserve('original', str(i))
    revised = p.Ledger(ledger, 14)
    assert revised.reserve('single-frame', 'next') == 5
    for i in range(9): revised.reserve('single-frame', str(10+i))
    with pytest.raises(RuntimeError, match='budget exhausted'):
        p.Ledger(ledger, 14).reserve('single-frame', 'over')


def test_response_cannot_be_relabelled_as_another_interval(modules, tmp_path, monkeypatch):
    c, p = modules
    u = unit('B')
    p.write(tmp_path/'plan.json', {})
    response = dict(choices=[dict(message=dict(content=json.dumps(observation())))])
    request = dict(name='fixture-A-images', planSha256=p.file_hash(tmp_path/'plan.json'),
        prompt=c.observation_prompt(u, 'images'), schema=c.observation_schema('images'), mediaSha256=['image'])
    p.write(tmp_path/'responses/fixture-B-images.json', dict(stage='validated', request=request,
        requestHash=c.digest(request), response=response, responseSha256=c.digest(response)))
    monkeypatch.setattr(p, 'observation_request', lambda *_: ([], ['image']))
    with pytest.raises(ValueError, match='bind this interval'):
        p.checked_observation(tmp_path, u, 'images')
