"""Behavior contracts for offline continuity evaluation; no model calls."""
import copy
import hashlib
import json
from pathlib import Path

import pytest


@pytest.fixture
def evaluator(monkeypatch, tmp_path):
    research = Path(__file__).resolve().parents[4] / '.trellis/tasks/10-18-framework-split-v2/research/harness'
    monkeypatch.syspath_prepend(str(research))
    import continuity_eval as ev

    def ref(name, data):
        path = tmp_path / name
        path.write_text(json.dumps(data))
        return dict(path=name, sha256=ev.file_hash(path))

    cases, predictions = [], []
    for n, relation in enumerate(ev.RELATIONS):
        source, media = ref(f'source{n}.json', [n]), ref(f'input{n}.json', [n, n])
        case = dict(id=f'case{n}', film=f'film{n}', source=source, input=media,
                    sourceSha256=source['sha256'], inputSha256=media['sha256'], sourceGroup=f'group{n}',
                    startPts=0, splitPts=333, endPts=666, timeBase='1/10000')
        case['adjudication'] = ref(f'label{n}.json', dict(identity=ev.identity(case), status='adjudicated',
            relation=relation, basis='business_review', reviewer='test human', rationale='synthetic contract fixture',
            inputContextReviewed=True))
        request = dict(case=case['id'], clipSha256=media['sha256'], prompt='synthetic')
        request_hash = ev.digest(request)
        response = ref(f'response{n}.json', dict(request=request, requestHash=request_hash, httpStatus=200,
            response=dict(choices=[dict(finish_reason='stop', message=dict(content=json.dumps(dict(relation=relation))))])))
        pred = dict(id=case['id'], inputSha256=case['inputSha256'], requestSha256=request_hash,
                    status='complete', relation=relation, response=response)
        cases.append(case)
        predictions.append(pred)

    def review(pred, gate='passed', update_response=False):
        if update_response:
            raw = ev.read(tmp_path/pred['response']['path'])
            raw['response']['choices'][0]['message']['content'] = json.dumps(dict(relation=pred['relation']))
            pred['response'] = ref(pred['response']['path'], raw)
        pred['factReview'] = ref(pred['id']+'-review.json', dict(
            prediction=dict(id=pred['id'], inputSha256=pred['inputSha256'], requestSha256=pred['requestSha256'],
                            responseSha256=pred['response']['sha256'], relation=pred['relation']),
            gate=gate, scope='complete_response', reviewer='test human', rationale='synthetic complete review'))

    for p in predictions:
        review(p)
    corpus = dict(schema=ev.VERSION, split='development', cases=cases)
    run = dict(name='synthetic', results=predictions)

    def save():
        ref('corpus.json', corpus)
        run['corpusSha256'] = ev.file_hash(tmp_path/'corpus.json')
        ref('run.json', run)
        return tmp_path/'corpus.json', tmp_path/'run.json'

    return ev, tmp_path, corpus, run, ref, review, save


def test_three_business_strata_and_per_film_counts(evaluator):
    ev, _, _, _, _, _, save = evaluator
    result = ev.evaluate(*save())
    assert result['reviewStatus'] == 'PASS_FOR_REVIEW'
    assert result['metrics']['groundedCorrect'] == {'count': 3, 'total': 3, 'rate': 1}
    assert result['metrics']['correctAbstention']['count'] == 1
    assert result['byFilm']['film0']['wrongMerge']['rate'] is None
    assert result['automaticAdoption'] is False and result['fullFilmQuality'] == 'UNVERIFIED'


def test_failure_and_missing_do_not_disappear_or_count_as_abstention(evaluator):
    ev, _, _, run, _, _, save = evaluator
    run['results'][0].update(status='failed', relation=None)
    run['results'].pop()  # unanswered uncertain case
    result = ev.evaluate(*save())
    m = result['metrics']
    assert m['failed'] == m['missing'] == 1
    assert m['groundedCorrect']['total'] == 3 and m['groundedCorrect']['count'] == 1
    assert m['correctAbstention'] == {'count': 0, 'total': 1, 'rate': 0}
    assert m['resolvedCoverage']['total'] == 2 and m['resolvedCoverage']['count'] == 1
    assert result['reviewStatus'] == 'FAIL'


def test_all_uncertain_cannot_win_by_avoiding_every_decision(evaluator):
    ev, _, _, run, _, review, save = evaluator
    for p in run['results']:
        p['relation'] = 'uncertain'
        review(p, update_response=True)
    m = ev.evaluate(*save())['metrics']
    assert m['wrongMerge']['count'] == m['wrongSplit']['count'] == 0
    assert m['correctAbstention']['count'] == 1
    assert m['unnecessaryAbstention']['count'] == 2
    assert m['resolvedCoverage']['count'] == 0 and m['groundedCorrect']['count'] == 1


def test_false_relations_remain_visible_when_facts_block_use(evaluator):
    ev, _, _, run, _, review, save = evaluator
    for p, relation in zip(run['results'], ['independent_material', 'same_review', 'same_review']):
        p['relation'] = relation
        review(p, 'failed', update_response=True)
    result = ev.evaluate(*save())
    m = result['metrics']
    assert m['wrongMerge']['count'] == m['wrongSplit']['count'] == m['unsupportedCommitment']['count'] == 1
    assert m['blockedByFacts'] == 3 and m['groundedCorrect']['count'] == 0
    assert all(r['effectiveRelation'] is None for r in result['rows'])


@pytest.mark.parametrize('gate', ['failed', 'unverified'])
def test_relation_match_requires_full_verified_evidence(evaluator, gate):
    ev, _, _, run, _, review, save = evaluator
    review(run['results'][2], gate)
    m = ev.evaluate(*save())['metrics']
    assert m['correctAbstention']['count'] == 0 and m['blockedByFacts'] == 1


@pytest.mark.parametrize('mutation', ['response', 'input', 'request', 'relation'])
def test_fact_review_cannot_cross_response_or_request_identity(evaluator, mutation):
    ev, _, _, run, ref, _, save = evaluator
    p = run['results'][0]
    if mutation == 'response': p['response'] = ref('changed.json', {'different': True})
    elif mutation == 'input': p['inputSha256'] = 'a'*64
    elif mutation == 'request': p['requestSha256'] = 'b'*64
    else: p['relation'] = 'uncertain'
    with pytest.raises(ValueError): ev.evaluate(*save())


def test_even_new_human_review_cannot_replace_the_actual_answer(evaluator):
    ev, _, _, run, _, review, save = evaluator
    p = run['results'][0]
    p['relation'] = 'uncertain'
    review(p)
    with pytest.raises(ValueError, match='retained raw response'): ev.evaluate(*save())


@pytest.mark.parametrize('fault', ['truncated', 'wrong_case', 'http_error'])
def test_incomplete_or_cross_case_receipt_cannot_be_complete(evaluator, fault):
    ev, root, _, run, ref, review, save = evaluator
    p = run['results'][0]
    raw = ev.read(root/p['response']['path'])
    if fault == 'truncated': raw['response']['choices'][0]['finish_reason'] = 'length'
    elif fault == 'wrong_case': raw['request']['case'] = 'different-case'
    else: raw['httpStatus'] = 400
    p['response'] = ref('invalid-receipt.json', raw)
    review(p)
    with pytest.raises(ValueError): ev.evaluate(*save())


@pytest.mark.parametrize('tamper', [False, True])
def test_9b_receipt_format_preserves_its_original_request_hash(evaluator, tamper):
    ev, root, _, run, ref, review, save = evaluator
    p = run['results'][0]
    raw = ev.read(root/p['response']['path'])
    request = raw.pop('request')
    raw['case'] = request['case']
    raw['identity'] = dict(request=request, planSha256='b'*64, runtime={'model': 'synthetic'})
    raw['requestHash'] = hashlib.sha256(json.dumps(raw['identity'],sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    p['requestSha256'] = raw['requestHash']
    if tamper: request['prompt'] = 'modified after the request'
    p['response'] = ref('9b-receipt.json', raw)
    review(p)
    if tamper:
        with pytest.raises(ValueError, match='identity changed'): ev.evaluate(*save())
    else:
        assert ev.evaluate(*save())['metrics']['groundedCorrect']['count'] == 3


@pytest.mark.parametrize('mutation', ['pending', 'wrong_input', 'fractional_pts', 'empty', 'duplicate'])
def test_unready_or_invalid_reference_cannot_be_scored(evaluator, mutation):
    ev, root, corpus, _, ref, _, save = evaluator
    case = corpus['cases'][0]
    if mutation in ('pending', 'wrong_input'):
        label = ev.read(root/case['adjudication']['path'])
        if mutation == 'pending': label.update(status='pending', relation='uncertain')
        else: label['identity']['inputSha256'] = 'a'*64
        case['adjudication'] = ref('changed-label.json', label)
    elif mutation == 'fractional_pts': case['splitPts'] = .0333
    elif mutation == 'empty': corpus['cases'] = []
    else: corpus['cases'].append(copy.deepcopy(case))
    with pytest.raises(ValueError): ev.evaluate(*save())


def unseen(evaluator, seen):
    ev, _, corpus, _, ref, _, _ = evaluator
    corpus['split'] = 'unseen'
    corpus['exposureRegistry'] = ref('exposure.json', dict(schema='continuity-exposure-v1', sources=seen))
    corpus['unseenReview'] = ref('unseen-review.json', dict(reviewer='test human', rationale='synthetic source history check',
        declaration='not_used_for_tuning_or_selection', exposureRegistrySha256=corpus['exposureRegistry']['sha256'],
        caseIdentitiesSha256=ev.digest([ev.identity(c) for c in corpus['cases']])))


@pytest.mark.parametrize('overlap', ['hash', 'derived_group', 'unknown_group', 'missing_review'])
def test_unseen_needs_source_disjointness_and_history_review(evaluator, overlap):
    ev, root, corpus, _, ref, _, save = evaluator
    first = corpus['cases'][0]
    seen = []
    if overlap == 'hash': seen = [dict(sha256=first['sourceSha256'], sourceGroup=None)]
    elif overlap == 'derived_group': seen = [dict(sha256='a'*64, sourceGroup=first['sourceGroup'])]
    elif overlap == 'unknown_group':
        first['sourceGroup'] = None
        label = ev.read(root/first['adjudication']['path'])
        label['identity'] = ev.identity(first)
        first['adjudication'] = ref('unknown-group-label.json', label)
    unseen(evaluator, seen)
    if overlap == 'missing_review': del corpus['unseenReview']
    with pytest.raises(ValueError): ev.evaluate(*save())


def test_bound_unseen_review_allows_scoring_but_not_adoption(evaluator):
    ev, _, _, _, _, _, save = evaluator
    unseen(evaluator, [dict(sha256='a'*64, sourceGroup='old-family')])
    result = ev.evaluate(*save())
    assert result['split'] == 'unseen' and result['automaticAdoption'] is False


def test_same_average_does_not_hide_lost_correct_case(evaluator):
    ev, _, _, run, _, review, save = evaluator
    run['results'][0]['relation'] = 'uncertain'
    review(run['results'][0], update_response=True)
    old = ev.evaluate(*save())
    run['results'][0]['relation'] = 'same_review'
    run['results'][1]['relation'] = 'uncertain'
    for p in run['results']: review(p, update_response=True)
    new = ev.evaluate(*save())
    assert old['metrics']['groundedCorrect'] == new['metrics']['groundedCorrect']
    assert ev.compare(old, new)['regressions'] == ['case1']


def test_missing_stratum_is_not_full_acceptance(evaluator):
    ev, _, corpus, run, _, _, save = evaluator
    corpus['cases'].pop()
    run['results'].pop()
    result = ev.evaluate(*save())
    assert result['reviewStatus'] == 'INCOMPLETE'
    assert result['metrics']['correctAbstention']['rate'] is None
