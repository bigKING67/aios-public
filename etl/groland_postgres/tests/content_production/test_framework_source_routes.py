"""Recall and non-adoption guards for the experimental source-review queue."""
import copy
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_harness import source_routes
from content_production.framework_v2 import rules


def shot(start, end, subject='person', chain=1, **facts):
    return dict(start=start, end=end, chain=chain, kind='own', ocr=[],
        facts=dict(subject=subject, style='selfie_ugc', celebrity_tag=False,
                   offer_text=False, people_count=1, talking_to_camera=False,
                   using_product=False, **facts))


@pytest.mark.parametrize('chain', [None, 1, 2])
def test_operation_after_face_needs_no_live_label_or_returning_person(chain):
    shots = [shot(7.533333333333333, 8.266666666666667),
             shot(8.266666666666667, 9.6, 'closeup', chain)]
    assert source_routes.candidates([], shots) == []
    routes = source_routes.continuity_candidates(shots)
    assert len(routes) == 1
    assert routes[0]['intervals'] == [[s['start'], s['end']] for s in shots]
    assert routes[0]['sourceRelation'] == 'uncertain'
    assert routes[0]['reviewStatus'] == 'unprobed'
    assert routes[0]['candidateBoundaries'] == []


def test_multi_shot_details_and_no_returning_presenter_are_not_dropped():
    shots = [shot(0, 5), shot(5, 7, 'closeup', None),
             shot(7, 9, 'product', None), shot(9, 11, 'closeup', None)]
    routes = source_routes.continuity_candidates(shots)
    assert [r['shotIndices'] for r in routes] == [[0, 1], [1, 2], [2, 3]]
    assert all(r['sourceRelation'] == 'uncertain' for r in routes)


@pytest.mark.parametrize('delta', [-0.001, 0.00001, 0.001, 1])
def test_safe_range_gaps_overlaps_and_nearby_boundaries_are_not_joined(delta):
    assert not source_routes.continuity_candidates([shot(0, 1), shot(1+delta, 3, 'product')])


@pytest.mark.parametrize('kind', ['ad', 'unknown', 'borrowed', 'street', 'promo'])
def test_new_own_route_does_not_erase_other_roles(kind):
    shots = [shot(0, 10), shot(10, 12, 'product')]
    shots[1]['kind'] = kind
    before = copy.deepcopy(shots)
    assert not source_routes.continuity_candidates(shots)
    assert shots == before


@pytest.mark.parametrize('subject,detail_chain,price', [
    ('closeup', None, False),  # own hand close-up / voice-over operation
    ('product', None, False),  # own product display
    ('closeup', 1, False),     # own split-screen comparison
    ('product', None, True),   # own display and price ending
])
def test_protected_own_review_is_queued_without_splitting_or_relabelling(subject, detail_chain, price):
    shots = [shot(0, 15), shot(15, 20, subject, detail_chain)]
    shots[1]['facts']['offer_text'] = price
    if price:
        shots[1]['ocr'] = ['到手99元']
    classified = copy.deepcopy(shots)
    expected, _ = rules.segment(classified, 20)
    expected = rules.finalize(expected, classified)
    assert expected == [[0.0, 20, rules.LIVE]]
    original = copy.deepcopy(shots)
    routes = source_routes.continuity_candidates(shots)
    assert len(routes) == 1
    assert routes[0]['classificationAction'] == 'none'
    assert routes[0]['automaticAdoption'] is False
    assert routes[0]['sourceRelation'] == 'uncertain'
    classified = copy.deepcopy(shots)
    actual, _ = rules.segment(classified, 20)
    assert rules.finalize(actual, classified) == expected
    assert shots == original


def test_face_count_operation_speech_and_price_flags_cannot_establish_source():
    shots = [shot(0, 12), shot(12, 15, 'closeup')]
    before = source_routes.continuity_candidates(shots)
    shots[1]['facts'].update(people_count=0, using_product=True,
                             talking_to_camera=True, offer_text=True)
    assert source_routes.continuity_candidates(shots) == before


def test_recall_scope_is_not_a_general_source_verdict():
    assert source_routes.continuity_candidates([]) == []
    assert source_routes.continuity_candidates([shot(0, 2)]) == []
    assert source_routes.continuity_candidates([shot(0, 2), shot(2, 4)]) == []


@pytest.fixture
def audit():
    path = Path(__file__).resolve().parents[4]/'.trellis/tasks/10-18-framework-split-v2/research/harness/source_route_audit.py'
    spec = importlib.util.spec_from_file_location('source_route_audit_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('changed', ['units.json', 'fact-impact-report.json', 'manual-fact-review.json'])
def test_offline_audit_rejects_changed_facts_or_review(audit, tmp_path, changed):
    files = []
    for name in ('units.json', 'fact-impact-report.json', 'manual-fact-review.json'):
        path = tmp_path/name
        path.write_text('{}')
        files.append(dict(path=name, bytes=path.stat().st_size, sha256=audit.file_hash(path)))
    audit.write(tmp_path/'evidence-manifest.json', dict(files=files))
    expected = audit.file_hash(tmp_path/'evidence-manifest.json')
    audit.verify_manifest(tmp_path, expected)
    (tmp_path/changed).write_text('[]')  # same size, different identity
    with pytest.raises(ValueError, match='evidence changed'):
        audit.verify_manifest(tmp_path, expected)


def test_offline_audit_rejects_missing_bound_inputs(audit, tmp_path):
    audit.write(tmp_path/'evidence-manifest.json', dict(files=[]))
    expected = audit.file_hash(tmp_path/'evidence-manifest.json')
    with pytest.raises(ValueError, match='Missing bound fact evidence'):
        audit.verify_manifest(tmp_path, expected)


def test_offline_audit_never_overwrites_previous_evidence(audit, tmp_path):
    path = tmp_path/'report.json'
    path.write_text('previous audit')
    with pytest.raises(ValueError, match='immutable'):
        audit.main(SimpleNamespace(output=path))
    assert path.read_text() == 'previous audit'
