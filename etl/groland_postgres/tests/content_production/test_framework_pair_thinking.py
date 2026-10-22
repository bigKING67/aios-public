import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def probe(monkeypatch, tmp_path):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[4] /
        '.trellis/tasks/10-18-framework-split-v2/research/harness'))
    import pair_thinking_probe as p
    write, read, sha = p.original.write, p.original.read, p.original.file_hash
    (tmp_path/'clip.mp4').write_bytes(b'synthetic video')
    schema = dict(type='object', properties=dict(relation=dict(type='string', enum=['same_review'])),
                  required=['relation'], additionalProperties=False)
    request = dict(case='case01',clip='clip.mp4',clipSha256=sha(tmp_path/'clip.mp4'),
                   prompt='same frozen task',localSchema=schema,wireSchema=schema)
    write(tmp_path/'requests.json',[request])
    write(tmp_path/'plan.json',dict(version=p.VERSION,maximum=12,order=p.order(),baselinePid='123',
        frozen={name:sha(tmp_path/name) for name in ('clip.mp4','requests.json')},code={}))
    write(tmp_path/'local-calls.json',dict(maximum=12,calls=[]))
    health=dict(units={'aios-vlm.service':{'MainPID':'123'}},serveSha256='a'*64)
    calls=[]
    data=dict(choices=[dict(finish_reason='stop',message=dict(content='{"relation":"same_review"}'))],usage={})
    def post(*args,**kwargs):
        assert len(read(tmp_path/'local-calls.json')['calls'])==len(calls)+1
        calls.append(kwargs['json'])
        response=copy.deepcopy(data)
        if kwargs['json']['chat_template_kwargs']['enable_thinking']:
            response['choices'][0]['message']['reasoning']='synthetic reasoning'
        return SimpleNamespace(status_code=200,raise_for_status=lambda:None,json=lambda:response)
    return p,tmp_path,request,health,SimpleNamespace(post=post),calls,data


def test_only_thinking_switch_changes_between_paired_bodies(probe):
    p,_,request,*_=probe
    off=p.body_for(request,'off',b'identical video')
    on=p.body_for(request,'on',b'identical video')
    assert off.pop('chat_template_kwargs')=={'enable_thinking':False}
    assert on.pop('chat_template_kwargs')=={'enable_thinking':True}
    assert off==on and off['max_tokens']==8192
    assert 'expected' not in json.dumps(off)
    assert len(p.order())==12
    assert [r['mode'] for r in p.order()[:4]]==['off','on','on','off']


def test_both_actual_response_modes_are_required_and_recorded(probe):
    p,root,_,health,session,calls,_=probe
    a=p.run_one(root,p.order()[0],session,health)
    b=p.run_one(root,p.order()[1],session,health)
    assert a['reasoningCharacters']==0 and b['reasoningCharacters']>0
    assert len(calls)==2 and len(p.original.read(root/'local-calls.json')['calls'])==2
    with pytest.raises(ValueError):p.run_one(root,p.order()[0],session,health)
    assert len(calls)==2


@pytest.mark.parametrize('fault',['length','json','schema'])
def test_bad_answer_is_retained_charged_and_blocks_following_calls(probe,fault):
    p,root,_,health,session,calls,data=probe
    choice=data['choices'][0]
    if fault=='length':choice['finish_reason']='length'
    elif fault=='json':choice['message']['content']='{'
    else:choice['message']['content']='{"relation":"invented"}'
    with pytest.raises(RuntimeError):p.run_one(root,p.order()[0],session,health)
    receipt=p.original.read(root/'responses/case01-off.json')
    assert receipt['response']['choices'][0]==choice
    assert len(p.original.read(root/'local-calls.json')['calls'])==1
    with pytest.raises(ValueError,match='Earlier incomplete'):p.run_one(root,p.order()[1],session,health)
    assert len(calls)==1


def test_transport_error_cannot_be_retried_or_reset(probe):
    p,root,_,health,session,_,_=probe
    attempts=[]
    def fail(*a,**kw):attempts.append(1);raise TimeoutError('not logged')
    session.post=fail
    with pytest.raises(RuntimeError):p.run_one(root,p.order()[0],session,health)
    with pytest.raises(ValueError):p.run_one(root,p.order()[0],session,health)
    assert len(attempts)==1
    assert p.original.read(root/'responses/case01-off.json')['error']=='TimeoutError'


@pytest.mark.parametrize('change',['media','code','budget','runtime','order'])
def test_changed_input_or_runtime_fails_before_reservation(probe,change):
    p,root,_,health,session,calls,_=probe
    plan=p.original.read(root/'plan.json')
    if change=='media':(root/'clip.mp4').write_bytes(b'other video')
    elif change=='code':
        (root/'helper.py').write_text('version2')
        plan['code']={str(root/'helper.py'):'a'*64}
        p.original.write(root/'plan.json',plan)
    elif change=='budget':p.original.write(root/'local-calls.json',dict(maximum=13,calls=[]))
    elif change=='runtime':health['units']['aios-vlm.service']['MainPID']='different'
    else:plan['order'].reverse();p.original.write(root/'plan.json',plan)
    with pytest.raises(ValueError):p.run_one(root,p.order()[0],session,health)
    assert not calls and not p.original.read(root/'local-calls.json')['calls']


def test_response_with_unrequested_reasoning_fails_the_mode_check(probe):
    p,root,_,health,session,_,data=probe
    data['choices'][0]['message']['reasoning']='unexpected'
    with pytest.raises(RuntimeError):p.run_one(root,p.order()[0],session,health)
    assert p.original.read(root/'responses/case01-off.json')['stage']=='response_received'
