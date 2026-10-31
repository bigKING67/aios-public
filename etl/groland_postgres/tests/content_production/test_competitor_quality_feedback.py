"""Minimal regressions derived from six production partials; no model/network calls."""
import copy
import hashlib
import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from test_competitor_analysis import card, CONTEXT
from content_production.competitor_analysis import contract, offline, quality_feedback, taxonomy, worker
from content_production.segment_suggestion_provider import ArkSegmentProvider, SuggestionError

SOURCE_SNAPSHOT_SHA256 = '09a4e6703c29c5579e7db63b15d2d6f589fe2eb23fcc50d0566b71137fc8ae04'


def previous(value):
    return {'analysis_id': 'previous', 'source_sha256': 'a' * 64, 'input_manifest_hash': 'b' * 64,
            'model_id': offline.MODEL, 'prompt_version': contract.PROMPT_VERSION,
            'taxonomy_version': taxonomy.TAXONOMY_VERSION, 'card': value}


def defect(name):
    value = card()
    if name == 'support_without_picture':
        value['claims'][0]['shown_refs'] = []
    elif name == 'undefined_hook':
        value['hook']['evidence_refs'].append('a1')
    elif name == 'undefined_trust':
        value['dimensions']['trust_cues']['labels'][0]['evidence_refs'] = ['s19']
    elif name == 'late_hook':
        value['evidence'][0]['time'].update(start_sec=3.6, end_sec=4.0)
    elif name == 'reversed_interval':
        value['evidence'][3]['time'].update(start_sec=206.4, end_sec=111.8)
    return value


@pytest.mark.parametrize('name,message', [
    ('support_without_picture', '没有画面证据'), ('undefined_hook', '未定义的证据 a1'),
    ('undefined_trust', '未定义的证据 s19'), ('late_hook', '3.6s'),
    ('reversed_interval', '206.4–111.8')])
def test_real_defect_kinds_remain_errors_and_reach_repair_feedback(name, message):
    row = previous(defect(name))
    row['card']['framework'] = {'sentinel': 'do-not-recompute-transcript'}
    before = copy.deepcopy(row)
    prompt, metadata = quality_feedback.build(row, 'a' * 64, CONTEXT, offline.MODEL)
    assert message in prompt
    assert metadata['issues']
    assert metadata['cardSha256'] and metadata['issuesSha256']
    assert 'do-not-recompute-transcript' not in prompt
    assert row == before
    # Adding repair context itself must never mutate the failed output into a success.
    assert any(i[0] == 'error' for i in contract.validate(row['card'], CONTEXT))


@pytest.mark.parametrize('field', ['source_sha256', 'model_id', 'prompt_version', 'taxonomy_version'])
def test_different_source_or_version_never_supplies_old_card(field):
    row = previous(defect('undefined_hook'))
    row[field] = 'different'
    assert quality_feedback.build(row, 'a' * 64, CONTEXT, offline.MODEL) == ('', None)


def test_current_host_validation_ignores_stale_stored_error_flags():
    row = previous(card())
    row['host_errors'] = [{'severity': 'error', 'path': 'hook', 'message': 'stale'}]
    assert quality_feedback.build(row, 'a' * 64, CONTEXT, offline.MODEL) == ('', None)


def test_budgeted_card_call_gets_feedback_without_an_extra_call(tmp_path, monkeypatch):
    source = tmp_path / 'fixture.mp4'
    source.write_bytes(b'fixture-only-no-upload')
    row = previous(defect('undefined_hook'))
    row['source_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    monkeypatch.setattr(offline, 'probe', lambda _: (20.0, 'available'))
    monkeypatch.setattr(offline, 'ffmpeg', lambda *_: source)
    # Provider schema input uses nested evidence; use the real conversion in the analysis path.
    value = card()
    by_id = {e['id']: e for e in value.pop('evidence')}
    for s in value['segments']:
        refs = s.pop('evidence_refs')
        s.pop('claim_refs')
        s['evidence'] = [by_id[k] for k in refs]
    value['segments'][1]['evidence'].append(by_id['s3'])
    post = Mock(return_value={'status': 'completed', 'output_text': json.dumps(value),
                              'usage': {'input_tokens': 100, 'output_tokens': 20}})
    record = offline.analyze('fixture', source, tmp_path, worker.SETTINGS, SimpleNamespace(_post=post), previous=row)
    assert post.call_count == 1
    prompt = post.call_args.args[0]['input'][0]['content'][-1]['text']
    assert '未定义的证据 a1' in prompt
    assert record['status'] == 'ok'
    assert not [i for i in record['issues'] if i[0] == 'error']
    assert record['input_manifest']['qualityFeedback']['analysisId'] == 'previous'
    assert record['usage']['qualityFeedback']['sourceSha256'] == row['source_sha256']
    assert record['cost'] == offline.cost({'input_tokens': 100, 'output_tokens': 20})


def provider(response):
    p = ArkSegmentProvider.__new__(ArkSegmentProvider)
    p.model = 'fixture-model'
    p.client = SimpleNamespace(_post=Mock(return_value=response))
    return p


def test_parse_failure_has_safe_diagnostics_without_changing_retry_budget():
    # Case six did not retain its raw response; this is a synthetic JSON failure, not a reconstruction.
    text = '{"segments": [RAW_BODY_SENTINEL'
    p = provider({'id': 'fixture-response', 'status': 'completed', 'output_text': text,
                  'usage': {'input_tokens': 11, 'output_tokens': 7}})
    with pytest.raises(SuggestionError) as caught:
        p._request([], {}, 'disabled')
    error = caught.value
    assert p.client._post.call_count == 1
    assert error.code == 'invalid_response'
    assert error.usage == {'input_tokens': 11, 'output_tokens': 7}
    assert error.diagnostics['errorType'] == 'JSONDecodeError'
    assert error.diagnostics['jsonPosition'] > 0
    assert error.diagnostics['outputSha256'] == hashlib.sha256(text.encode()).hexdigest()
    assert error.diagnostics['outputChars'] == len(text)
    assert 'RAW_BODY_SENTINEL' not in str(error) + json.dumps(error.diagnostics)


def test_incomplete_and_missing_text_stay_distinct_failures():
    for response, code, error_type in [
        ({'status': 'incomplete'}, 'provider_incomplete', None),
        ({'status': 'completed', 'output': []}, 'invalid_response', 'ArkResponsesError')]:
        p = provider(response)
        with pytest.raises(SuggestionError) as caught:
            p._request([], {}, 'disabled')
        assert caught.value.code == code
        assert caught.value.diagnostics.get('errorType') == error_type
        assert 'outputSha256' not in caught.value.diagnostics
        assert p.client._post.call_count == 1
