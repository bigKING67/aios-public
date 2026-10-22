import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def probe(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[4]/
        '.trellis/tasks/10-18-framework-split-v2/research/harness'))
    import pair_video_probe
    return pair_video_probe


@pytest.fixture
def experiment(probe, tmp_path, monkeypatch):
    source, clip = tmp_path/'source.mp4', tmp_path/'clip.mp4'
    source.write_bytes(b'fixture source')
    clip.write_bytes(b'fixture clip')
    unit = dict(source=str(source), sourceSha256=probe.file_hash(source),
        clip=clip.name, clipSha256=probe.file_hash(clip),
        anchors=[dict(secondsExact=str(n)) for n in range(3)],
        videoFrames=[dict(number=n, group='A' if n <= 8 else 'B') for n in range(1,17)])
    units = [dict(unit, id=f'case{i:02d}') for i in range(1,7)]
    probe.write(tmp_path/'units.json', units)
    probe.write(tmp_path/'protocol.json', dict(model='fixture-model', sampling=dict(max_tokens=600)))
    probe.write(tmp_path/'expected.json', dict(answer_marker='never-send-me'))
    code = tmp_path/'code.py'
    code.write_text('# frozen protocol')
    probe.write(tmp_path/'plan.json', dict(version=probe.VERSION, maximum=6,
        caseOrder=[u['id'] for u in units], code={str(code):probe.file_hash(code)},
        frozen={p:probe.file_hash(tmp_path/p) for p in ('units.json','protocol.json','expected.json')}))
    probe.write(tmp_path/'local-calls.json', dict(maximum=6, calls=[]))
    key = tmp_path/'.config/aios/desktop-vlm.key'
    key.parent.mkdir(parents=True)
    key.write_text('test-only')
    monkeypatch.setattr(probe.Path, 'home', lambda: tmp_path)
    monkeypatch.setattr(probe.runtime, 'live_health', lambda: dict(serveSha256='fixture'))
    payload = dict(observations=dict(A=dict(description='衣袖与道具',frames=[1]),
        B=dict(description='衣袖与道具',frames=[9])), relation='uncertain',reason='连接不足')
    response = dict(choices=[dict(message=dict(content=json.dumps(payload)),finish_reason='stop')])
    calls=[]
    def post(*a,**kw):
        calls.append(kw['json'])
        return SimpleNamespace(status_code=200, raise_for_status=lambda:None,json=lambda:response)
    monkeypatch.setattr(probe.local_vlm,'LocalVlm',lambda:SimpleNamespace(model='fixture-model',
        session=SimpleNamespace(post=post,close=lambda:None)))
    return tmp_path,calls,response,payload


def test_frozen_answers_never_enter_model_request_and_success_is_not_repeated(probe,experiment):
    root,calls,_,_=experiment
    probe.run(root,'case01')
    assert 'never-send-me' not in json.dumps(calls)
    assert 'answer_marker' not in json.dumps(calls)
    assert [c['type'] for c in calls[0]['messages'][0]['content']] == ['video_url','text']
    with pytest.raises(ValueError,match='Already attempted'):probe.run(root,'case01')
    assert len(calls)==1


@pytest.mark.parametrize('fault',['json','truncated','cross_group'])
def test_bad_answers_survive_and_block_retry_and_next_case(probe,experiment,fault):
    root,calls,response,payload=experiment
    if fault=='json':response['choices'][0]['message']['content']='broken JSON'
    elif fault=='truncated':response['choices'][0]['finish_reason']='length'
    else:
        payload['observations']['A']['frames']=[9]
        response['choices'][0]['message']['content']=json.dumps(payload)
    raw=copy.deepcopy(response)
    with pytest.raises(RuntimeError,match='no retry'):probe.run(root,'case01')
    receipt=probe.read(root/'responses/case01.json')
    assert receipt['response']['choices']==raw['choices']
    assert len(probe.read(root/'local-calls.json')['calls'])==1
    with pytest.raises(ValueError,match='Already attempted'):probe.run(root,'case01')
    with pytest.raises(ValueError,match='Earlier incomplete'):probe.run(root,'case02')
    assert len(calls)==1


@pytest.mark.parametrize('changed',['source.mp4','clip.mp4','code.py','units.json','expected.json'])
def test_changed_source_protocol_or_expectations_block_network(probe,experiment,changed):
    root,calls,_,_=experiment
    (root/changed).write_text('changed')
    with pytest.raises(ValueError):probe.run(root,'case01')
    assert calls==[]


def test_case_order_and_crash_reservation_are_not_bypassed(probe,experiment):
    root,calls,_,_=experiment
    with pytest.raises(ValueError,match='case order'):probe.run(root,'case02')
    probe.run(root,'case01')
    (root/'responses/case01.json').unlink()
    with pytest.raises(ValueError,match='Already attempted'):probe.run(root,'case01')
    with pytest.raises(ValueError,match='Earlier incomplete'):probe.run(root,'case02')
    assert len(calls)==1


def test_experiment_cannot_be_refrozen_or_budget_reset(probe,experiment):
    root,calls,_,_=experiment
    before=probe.file_hash(root/'local-calls.json')
    with pytest.raises(ValueError,match='Never reset'):probe.freeze(root)
    assert probe.file_hash(root/'local-calls.json')==before and calls==[]


@pytest.fixture
def compatible(probe,experiment):
    import pair_video_compatible
    root,_,_,_=experiment
    probe.Ledger(root/'local-calls.json',6).reserve('local_pair_source','initial400')
    probe.write(root/'responses/case01.json',dict(requestHash='initial400',httpStatus=400,
        request=dict(case='case01'),stage='reserved',error='HTTPError'))
    probe.write(root/'http400-validator-diagnosis.json',dict(schemas=[dict(case=f'case{i:02d}',
        originalUnsupported=True,compatibleUnsupported=False,grammarCompiled=True) for i in range(1,7)]))
    (root/'code').mkdir()
    pair_video_compatible.freeze(root)
    return pair_video_compatible


def test_transport_revision_only_removes_unique_items(probe,compatible,experiment):
    root,_,_,_=experiment
    _,schema=probe.request(probe.read(root/'units.json')[1])
    before=copy.deepcopy(schema)
    wire=compatible.wire_schema(schema)
    assert schema==before and wire!=schema
    for g in ('A','B'):
        wire['properties']['observations']['properties'][g]['properties']['frames']['uniqueItems']=True
    assert wire==schema


def test_revision_keeps_failure_budget_answers_and_original_host_schema(probe,compatible,experiment):
    root,calls,_,_=experiment
    original_hash=probe.file_hash(root/'responses/case01.json')
    compatible.run(root,'case02')
    assert len(probe.read(root/'local-calls.json')['calls'])==2 and len(calls)==1
    receipt=probe.read(root/'responses/case02.json')
    assert receipt['request']['schema']!=receipt['request']['wireSchema']
    assert calls[0]['response_format']['json_schema']['schema']==receipt['request']['wireSchema']
    assert 'never-send-me' not in json.dumps(calls)
    assert probe.file_hash(root/'responses/case01.json')==original_hash
    with pytest.raises(ValueError,match='cannot be retried'):compatible.run(root,'case01')
    with pytest.raises(ValueError,match='Already attempted'):compatible.run(root,'case02')
    with pytest.raises(ValueError,match='Never overwrite'):compatible.freeze(root)


def test_duplicate_citations_still_fail_local_validation(probe,compatible,experiment):
    root,calls,response,payload=experiment
    payload['observations']['A']['frames']=[1,1]
    response['choices'][0]['message']['content']=json.dumps(payload)
    with pytest.raises(RuntimeError,match='no retry'):compatible.run(root,'case02')
    receipt=probe.read(root/'responses/case02.json')
    assert receipt['response']['choices']==response['choices'] and receipt['error']=='ValidationError'
    with pytest.raises(ValueError,match='Incomplete'):compatible.run(root,'case03')
    assert len(calls)==1 and len(probe.read(root/'local-calls.json')['calls'])==2


@pytest.mark.parametrize('changed',['responses/case01.json','http400-validator-diagnosis.json'])
def test_revision_failure_and_target_proof_remain_frozen(probe,compatible,experiment,changed):
    root,calls,_,_=experiment
    (root/changed).write_text('changed')
    with pytest.raises(ValueError,match='Revision evidence'):compatible.run(root,'case02')
    assert calls==[]


def test_revision_saves_sanitized_http_failure_before_raising(probe,compatible,experiment,monkeypatch):
    root,_,_,_=experiment
    def fail():raise ValueError('HTTP400')
    response=SimpleNamespace(status_code=400,text='error test-only data:video/mp4;base64,abc',raise_for_status=fail)
    monkeypatch.setattr(probe.local_vlm,'LocalVlm',lambda:SimpleNamespace(model='fixture-model',
        session=SimpleNamespace(post=lambda *a,**kw:response,close=lambda:None)))
    with pytest.raises(RuntimeError,match='no retry'):compatible.run(root,'case02')
    receipt=probe.read(root/'responses/case02.json')
    assert receipt['stage']=='http_error_received'
    assert 'test-only' not in receipt['httpError'] and 'base64' not in receipt['httpError']
    assert receipt['httpErrorSha256']==probe.digest(response.text)


def test_revision_does_not_extend_six_attempt_limit(probe,compatible,experiment):
    root,calls,_,_=experiment
    ledger=probe.Ledger(root/'local-calls.json',6)
    for i in range(5):ledger.reserve('fixture',str(i))
    with pytest.raises(ValueError,match='exhausted'):compatible.run(root,'case02')
    assert calls==[]
