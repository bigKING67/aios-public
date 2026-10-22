"""Source-evidence boundaries; all positive examples here are synthetic."""
import copy
import json
from pathlib import Path

import pytest


@pytest.fixture
def sample(monkeypatch):
    research = Path(__file__).resolve().parents[4] / '.trellis/tasks/10-18-framework-split-v2/research/harness'
    monkeypatch.syspath_prepend(str(research))
    import continuity_evidence as gate

    unit = dict(id='fixture', sourceSha256='a'*64, clipSha256='b'*64, videoFrames=[
        dict(number=n, group='A' if n <= 3 else 'B', rgbSha256=str(n)*64,
             anchor=dict(frame=n*2, pts=n*1001, timeBase='1/30000')) for n in range(1, 7)])
    payload = dict(observations={
        'A': dict(description='The lid is opening; a distinct blue sleeve is visible.', frames=[1, 2]),
        'B': dict(description='The open lid remains in the blue sleeve hand.', frames=[4, 5])},
        relation='same_review', reason='Reviewed synthetic action and configuration bridge.')
    request = dict(case='fixture', clipSha256=unit['clipSha256'], schema={'type': 'object'})
    raw = dict(request=request, requestHash=gate.digest(request), httpStatus=200)
    receipt_sha = 'd'*64

    def sync():
        raw['response'] = dict(choices=[dict(finish_reason='stop', message=dict(content=json.dumps(payload)))])
        raw['responseSha256'] = gate.digest(raw['response'])
        raw['payload'] = copy.deepcopy(payload)

    sync()
    review = dict(schema=gate.VERSION, binding=gate.binding(raw, unit, receipt_sha),
        authority='assistant_development_review', reviewer='synthetic test reviewer',
        rationale='Synthetic complete review, not real model quality.', scope='complete_response',
        claims={k: dict(**v, verdict='supported', rationale='Synthetic supported claim.')
                for k, v in gate.review_claims(payload, gate.frame_catalog(unit)).items()},
        relationEvidence=[dict(kind='visible_operation_bridge', verdict='supported',
            rationale='Synthetic action bridge, not merely matching product.', frames={'A': [2], 'B': [4]})])
    return gate, unit, raw, payload, review, receipt_sha, sync


def run(sample):
    gate, unit, raw, _, review, receipt_sha, _ = sample
    return gate.admit(raw, unit, receipt_sha, review)


@pytest.mark.parametrize('relation,kind', [
    ('same_review', 'visible_operation_bridge'),
    ('same_review', 'distinctive_configuration_bridge'),
    ('independent_material', 'independent_sequence_change'),
    ('uncertain', None),
])
def test_reviewed_synthetic_positive_and_genuine_abstention_pass(sample, relation, kind):
    _, _, _, payload, review, _, sync = sample
    payload['relation'] = relation
    sync()
    if kind:
        review['relationEvidence'][0]['kind'] = kind
    else:
        review['relationEvidence'] = []
    result = run(sample)
    assert result['status'] == 'admissible_for_review'
    assert result['effectiveRelation'] == relation
    assert result['automaticAdoption'] is result['automaticVisualVerification'] is False


@pytest.mark.parametrize('kind', sorted([
    'shared_product', 'shared_theme', 'caption_link', 'presentation_order', 'background_change_only']))
def test_true_but_nondiagnostic_evidence_cannot_authorize_relation(sample, kind):
    sample[4]['relationEvidence'][0]['kind'] = kind
    result = run(sample)
    assert result['status'] == 'blocked'
    assert result['modelRelation'] == 'same_review' and result['effectiveRelation'] is None
    assert 'no_qualifying_source_connection' in result['problems']


def test_nondiagnostic_reason_stays_blocked_even_if_other_fact_is_pending(sample):
    sample[4]['relationEvidence'][0]['kind'] = 'shared_product'
    sample[4]['claims']['A']['verdict'] = 'unverified'
    assert run(sample)['status'] == 'blocked'


def test_missing_review_is_pending_not_model_uncertain(sample):
    gate, unit, raw, _, _, receipt_sha, _ = sample
    result = gate.admit(raw, unit, receipt_sha)
    assert result['status'] == 'pending_review'
    assert result['modelRelation'] == 'same_review' and result['effectiveRelation'] is None


@pytest.mark.parametrize('verdict,status', [
    ('unverified', 'pending_review'), ('unsupported', 'blocked'), ('citation_mismatch', 'blocked')])
def test_unknown_fact_not_equated_to_proven_error(sample, verdict, status):
    sample[4]['claims']['A']['verdict'] = verdict
    result = run(sample)
    assert result['status'] == status and result['effectiveRelation'] is None


def test_unverified_connection_cannot_be_marked_verified_by_its_category(sample):
    sample[4]['relationEvidence'][0]['verdict'] = 'unverified'
    assert run(sample)['status'] == 'pending_review'


def test_review_cannot_drop_one_bad_observation_or_reason(sample):
    del sample[4]['claims']['reason']
    with pytest.raises(ValueError, match='cover'):
        run(sample)


def test_cannot_review_only_supported_substring(sample):
    sample[4]['claims']['A']['textSha256'] = sample[0].digest('The lid is opening.')
    with pytest.raises(ValueError, match='changed text'):
        run(sample)


@pytest.mark.parametrize('frames', [[True], [1, 1], [4], [99]])
def test_wrong_side_duplicate_boolean_or_unknown_citation_rejected(sample, frames):
    sample[3]['observations']['A']['frames'] = frames
    sample[6]()
    with pytest.raises(ValueError, match='Citation'):
        run(sample)


def test_correct_frame_elsewhere_in_interval_cannot_silently_repair_answer(sample):
    sample[4]['relationEvidence'][0]['frames']['A'] = [3]
    with pytest.raises(ValueError, match='uncited frames'):
        run(sample)


def test_review_cannot_replace_original_observation_citations(sample):
    sample[4]['claims']['A']['frames']['A'] = [3]
    with pytest.raises(ValueError, match='original citations'):
        run(sample)


@pytest.mark.parametrize('target', ['input', 'unit', 'response_receipt', 'request'])
def test_stale_bindings_fail_closed(sample, target):
    gate, unit, raw, _, review, receipt_sha, _ = sample
    if target == 'input':
        unit['clipSha256'] = 'e'*64
    elif target == 'unit':
        unit['videoFrames'][0]['rgbSha256'] = 'e'*64
    elif target == 'response_receipt':
        receipt_sha = 'e'*64
    else:
        raw['request']['prompt'] = 'changed'
    with pytest.raises(ValueError):
        gate.admit(raw, unit, receipt_sha, review)


def test_retained_payload_cannot_override_actual_answer(sample):
    sample[2]['payload']['relation'] = 'uncertain'
    with pytest.raises(ValueError, match='differs'):
        run(sample)


def test_truncated_response_is_not_usable(sample):
    sample[2]['response']['choices'][0]['finish_reason'] = 'length'
    sample[2]['responseSha256'] = sample[0].digest(sample[2]['response'])
    with pytest.raises(ValueError, match='Incomplete'):
        run(sample)


def test_extra_unreviewed_model_text_cannot_escape_coverage(sample):
    sample[3]['extra_claim'] = 'Secretly unsupported claim.'
    sample[6]()
    with pytest.raises(ValueError, match='Unsupported pair'):
        run(sample)


def test_model_self_report_is_not_external_visual_review(sample):
    sample[4]['authority'] = 'model_self_report'
    with pytest.raises(ValueError, match='External'):
        run(sample)


def test_opposite_reviewed_proof_does_not_authorize_model_relation(sample):
    sample[4]['relationEvidence'][0]['kind'] = 'independent_sequence_change'
    assert 'no_qualifying_source_connection' in run(sample)['problems']


def test_conflicting_supported_evidence_does_not_choose_arbitrarily(sample):
    sample[4]['relationEvidence'].append(dict(sample[4]['relationEvidence'][0], kind='independent_sequence_change'))
    assert 'conflicting_relation_evidence' in run(sample)['problems']


def test_uncertain_does_not_hide_reviewed_decisive_evidence(sample):
    sample[3]['relation'] = 'uncertain'
    sample[6]()
    assert run(sample)['status'] == 'blocked'


def test_source_clock_remains_exact_and_frame_reordering_rejected(sample):
    gate, unit, *_ = sample
    assert gate.frame_catalog(unit)[1]['anchor']['timeBase'] == '1/30000'
    unit['videoFrames'][1]['anchor']['pts'] = 1000
    with pytest.raises(ValueError, match='source order'):
        gate.frame_catalog(unit)


def test_legacy_adapter_preserves_partial_and_unknown_not_expected_label(sample):
    import continuity_evidence_replay as replay
    gate, unit, raw, _, _, receipt_sha, _ = sample
    old = dict(responseReceiptSha256=receipt_sha, predictedRelation='same_review',
        expectedRelation='independent_material', findings={
            'A': dict(status='supported', evidence='old supported observation'),
            'B': dict(status='unverified', evidence='old unknown accessory'),
            'reason': dict(status='partial', evidence='old incomplete relation argument')})
    annotation = dict(kinds=['visible_operation_bridge'], rationale='Old reason category only.')
    review = replay.external_review(raw, unit, receipt_sha, old, annotation, {})
    assert review['claims']['B']['verdict'] == review['claims']['reason']['verdict'] == 'unverified'
    assert gate.admit(raw, unit, receipt_sha, review)['status'] == 'pending_review'
    old['expectedRelation'] = 'same_review'
    assert replay.external_review(raw, unit, receipt_sha, old, annotation, {}) == review


def test_legacy_adapter_refuses_review_of_other_response(sample):
    import continuity_evidence_replay as replay
    _, unit, raw, _, _, receipt_sha, _ = sample
    old = dict(responseReceiptSha256='e'*64, predictedRelation='same_review')
    with pytest.raises(ValueError, match='stale'):
        replay.external_review(raw, unit, receipt_sha, old, {}, {})


def test_replay_checks_parent_files_not_only_manifest_identity(sample, tmp_path, monkeypatch):
    import continuity_evidence_replay as replay
    media = tmp_path/'frame.bin'
    media.write_bytes(b'fixed decoded frame')
    manifest = tmp_path/'evidence-manifest.json'
    manifest.write_text(json.dumps(dict(files=[dict(path=media.name, bytes=media.stat().st_size,
                                                  sha256=replay.file_hash(media))])))
    monkeypatch.setattr(replay, 'PARENT_SHA', replay.file_hash(manifest))
    assert replay.verify_parent(tmp_path) == 1
    media.write_bytes(b'changed decoded frame')
    with pytest.raises(ValueError, match='evidence changed'):
        replay.verify_parent(tmp_path)
