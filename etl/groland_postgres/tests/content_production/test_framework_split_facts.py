import json
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def probe(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[4]/
        '.trellis/tasks/10-18-framework-split-v2/research/harness'))
    import split_fact_probe
    return split_fact_probe


@pytest.fixture
def experiment(probe, tmp_path, monkeypatch):
    source = tmp_path/'source.mp4'
    source.write_bytes(b'synthetic source')
    media = tmp_path/'frame.jpg'
    media.write_bytes(b'synthetic JPEG')
    probe.write(tmp_path/'units.json', [dict(id='fixture', shot=5, source=str(source),
        sourceSha256=probe.file_hash(source), images=[dict(path=media.name, sha256=probe.file_hash(media))])])
    probe.write(tmp_path/'protocol.json', dict(prompts=dict(images='fixed observation prompt'),
        schema=dict(type='object', properties=dict(visible=dict(type='boolean')), required=['visible'], additionalProperties=False),
        sampling=dict(max_tokens=300, temperature=0, seed=0, chat_template_kwargs={'enable_thinking': False})))
    code = tmp_path/'code.py'
    code.write_text('# frozen code\n')
    probe.write(tmp_path/'plan.json', dict(version=probe.VERSION, maximum=probe.MAXIMUM,
        frozen={name: probe.file_hash(tmp_path/name) for name in ('units.json', 'protocol.json')},
        code={str(code): probe.file_hash(code)}))
    probe.write(tmp_path/'local-calls.json', dict(maximum=8, calls=[]))
    key_path = tmp_path/'.config/aios/desktop-vlm.key'
    key_path.parent.mkdir(parents=True)
    key_path.write_text('test-only-not-a-credential')
    monkeypatch.setattr(probe.Path, 'home', lambda: tmp_path)
    monkeypatch.setattr(probe.runtime, 'live_health', lambda: dict(serveSha256='fixture'))
    calls = []
    response = dict(choices=[dict(message=dict(content='{"visible": true}'), finish_reason='stop')], usage={})
    def post(*args, **kwargs):
        calls.append(kwargs['json'])
        return SimpleNamespace(status_code=200, raise_for_status=lambda: None, json=lambda: response)
    monkeypatch.setattr(probe.local_vlm, 'LocalVlm', lambda: SimpleNamespace(
        model='fixture-model', session=SimpleNamespace(post=post, close=lambda: None)))
    return tmp_path, calls, response


def test_completed_call_cannot_be_repeated_and_expected_answers_are_not_sent(probe, experiment):
    root, calls, _ = experiment
    probe.write(root/'expected.json', dict(secret_target='must never reach the model'))
    probe.run(root, 5, 'images')
    with pytest.raises(ValueError, match='Already attempted'): probe.run(root, 5, 'images')
    assert len(calls) == 1
    assert 'secret_target' not in json.dumps(calls)
    assert probe.read(root/'responses/fixture-images.json')['stage'] == 'validated'
    assert len(probe.read(root/'local-calls.json')['calls']) == 1


@pytest.mark.parametrize('content,finish', [('broken JSON', 'length'), ('{"visible": "yes"}', 'stop'),
                                          ('{"visible": true}', 'length')])
def test_malformed_or_truncated_response_is_preserved_and_not_retried(probe, experiment, content, finish):
    root, calls, response = experiment
    response['choices'][0].update(message=dict(content=content), finish_reason=finish)
    with pytest.raises(RuntimeError, match='no retry'): probe.run(root, 5, 'images')
    receipt = probe.read(root/'responses/fixture-images.json')
    assert receipt['stage'] == 'response_received'
    assert receipt['response']['choices'][0]['message']['content'] == content
    assert len(probe.read(root/'local-calls.json')['calls']) == 1
    with pytest.raises(ValueError, match='Already attempted'): probe.run(root, 5, 'images')
    assert len(calls) == 1


@pytest.mark.parametrize('change', ['code', 'protocol', 'media', 'source', 'budget', 'reservation'])
def test_changed_input_or_exhausted_budget_cannot_reach_model(probe, experiment, change):
    root, calls, _ = experiment
    if change in ('code', 'protocol', 'media', 'source'):
        path = dict(code='code.py', protocol='protocol.json', media='frame.jpg', source='source.mp4')[change]
        (root/path).write_text('changed')
        error = ValueError
    elif change == 'budget':
        probe.write(root/'local-calls.json', dict(maximum=8, calls=[dict(requestHash=str(i)) for i in range(8)]))
        error = RuntimeError
    else:
        # A crash left a reservation and no response file; retry must still stop.
        probe.run(root, 5, 'images')
        (root/'responses/fixture-images.json').unlink()
        calls.clear()
        error = ValueError
    with pytest.raises(error): probe.run(root, 5, 'images')
    assert calls == []
