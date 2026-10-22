import json
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def target(monkeypatch,tmp_path):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[4]/'.trellis/tasks/10-18-framework-split-v2/research/harness'))
    import target_9b_probe as probe
    schema=dict(type='object',properties=dict(frames=dict(type='array',items=dict(type='integer',enum=[1,2]),uniqueItems=True)),required=['frames'])
    (tmp_path/'clip.mp4').write_bytes(b'frozen video')
    rows=[dict(case=f'case{i:02d}',clip='clip.mp4',prompt='visible evidence only',localSchema=schema,
        body=dict(model='test-model',max_tokens=600)) for i in range(1,7)]
    probe.write(tmp_path/'requests.json',rows)
    probe.write(tmp_path/'plan.json',dict(maximum=6,cloudCalls=0,automaticAdoption=False,
        caseOrder=[r['case'] for r in rows],files={p:probe.sha(tmp_path/p) for p in ('requests.json','clip.mp4')}))
    probe.write(tmp_path/'local-calls.json',dict(maximum=6,calls=[]))
    payload=dict(frames=[1])
    data=dict(choices=[dict(message=dict(content=json.dumps(payload)),finish_reason='stop')])
    calls=[]
    def post(*a,**kw):
        calls.append(kw['json'])
        return SimpleNamespace(status_code=200,raise_for_status=lambda:None,json=lambda:data)
    session=SimpleNamespace(post=post)
    return probe,tmp_path,session,calls,data


def test_9b_success_keeps_exact_input_and_never_repeats(target):
    p,root,s,calls,data=target
    p.run_case(root,'case01',s,'secret',{})
    assert len(calls)==1 and len(p.read(root/'local-calls.json')['calls'])==1
    assert calls[0]['messages'][0]['content'][1]['text']=='visible evidence only'
    assert 'secret' not in json.dumps(p.read(root/'responses/case01.json'))
    with pytest.raises(ValueError,match='Never retry'):p.run_case(root,'case01',s,'secret',{})


@pytest.mark.parametrize('fault',['json','duplicate','truncated'])
def test_9b_bad_raw_answer_is_retained_and_blocks_next(target,fault):
    p,root,s,calls,data=target
    if fault=='json':data['choices'][0]['message']['content']='invalid'
    elif fault=='duplicate':data['choices'][0]['message']['content']='{"frames":[1,1]}'
    else:data['choices'][0]['finish_reason']='length'
    with pytest.raises(RuntimeError):p.run_case(root,'case01',s,'secret',{})
    assert p.read(root/'responses/case01.json')['response']['choices']==data['choices']
    with pytest.raises(ValueError,match='Earlier failed'):p.run_case(root,'case02',s,'secret',{})
    assert len(calls)==1


@pytest.mark.parametrize('name',['clip.mp4','requests.json'])
def test_9b_mutated_input_blocks_network(target,name):
    p,root,s,calls,_=target
    (root/name).write_text('changed')
    with pytest.raises(ValueError,match='Frozen experiment'):p.run_case(root,'case01',s,'secret',{})
    assert calls==[]


def test_9b_limit_and_order_are_fail_closed(target):
    p,root,s,calls,_=target
    with pytest.raises(ValueError,match='order'):p.run_case(root,'case02',s,'secret',{})
    p.write(root/'local-calls.json',dict(maximum=6,calls=[{}]*6))
    with pytest.raises(ValueError,match='exhausted'):p.run_case(root,'case01',s,'secret',{})
    assert calls==[]


def test_9b_http_failure_retains_redacted_body(target):
    p,root,_,calls,_=target
    def fail():raise ValueError('HTTP400')
    response=SimpleNamespace(status_code=400,text='secret data:video/mp4;base64,private',content=b'raw error',raise_for_status=fail)
    session=SimpleNamespace(post=lambda *a,**kw:response)
    with pytest.raises(RuntimeError):p.run_case(root,'case01',session,'secret',{})
    record=p.read(root/'responses/case01.json')
    assert record['stage']=='http_error_received' and 'secret' not in record['httpError'] and 'private' not in record['httpError']
    assert len(p.read(root/'local-calls.json')['calls'])==1


@pytest.mark.parametrize('fault',['weights','baseline','worker','busy'])
def test_launcher_never_stops_baseline_when_precheck_fails(target,monkeypatch,fault):
    import sys
    p,root,_,_,_=target
    monkeypatch.setitem(sys.modules,'probe',p)
    import target_9b_launch as launcher
    monkeypatch.setattr(launcher,'ROOT',root)
    monkeypatch.setattr(launcher.Path,'home',lambda:root)
    model=root/'model'
    model.mkdir()
    (model/'weights').write_bytes(b'weights')
    (root/'baseline').write_text('baseline')
    (root/'aios-vlm').mkdir()
    (root/'aios-vlm/api_key').write_text('fixture-only')
    p.write(root/'download-state.json',dict(stage='verified',revision='pin',modelPath=str(model),
        files=[dict(name='weights',bytes=7,sha256=p.sha(model/'weights'))]))
    monkeypatch.setattr(launcher,'frozen',lambda _:dict(modelRevision='pin',baselineFiles={str(root/'baseline'):p.sha(root/'baseline') if fault!='baseline' else 'bad'}))
    if fault=='weights':(model/'weights').write_text('changed')
    actions=[]
    monkeypatch.setattr(launcher.subprocess,'run',lambda *a,**kw:actions.append(a))
    monkeypatch.setattr(launcher.subprocess,'check_output',lambda *a,**kw:'active\n' if fault=='worker' else 'inactive\n')
    class Session:
        trust_env=True
        def __init__(self):self.headers={}
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def get(self,url,**kw):
            return SimpleNamespace(raise_for_status=lambda:None,
                text='vllm:num_requests_running{} 1\nvllm:num_requests_waiting{} 0')
    monkeypatch.setattr(launcher.requests,'Session',Session)
    with pytest.raises(ValueError):launcher.main()
    assert actions==[]


@pytest.mark.parametrize('fault',['decoded_pixels','expected_label'])
def test_freeze_rejects_changed_model_input_or_development_expectation(target,fault):
    import pair_9b_prepare as prepare
    p,root,_,_,_=target
    unit=dict(id='case01',clipSha256='clip',videoFrames=[dict(index=1,rgbSha256='pixels')])
    p.write(root/'units.json',[unit])
    p.write(root/'expected.json',dict(relation='uncertain'))
    p.write(root/'input-review.json',dict(unitsSha256=p.sha(root/'units.json'),
        expectedSha256=p.sha(root/'expected.json')))
    p.write(root/'upload.json',{})
    p.write(root/'decoder-proof.json',dict(modelPath=prepare.MODEL,rows=[dict(
        case='case01',clipSha256='clip',grammarCompiled=True,
        frames=[dict(index=1,rgbSha256='changed' if fault=='decoded_pixels' else 'pixels')])]))
    if fault=='expected_label':p.write(root/'expected.json',dict(relation='same_review'))
    (root/'plan.json').unlink()  # Remove only this test fixture's earlier runner plan.
    with pytest.raises(ValueError,match='Candidate target inputs|Original expectations'):
        prepare.freeze(root)
    assert not (root/'plan.json').exists()
