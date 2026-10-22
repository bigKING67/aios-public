import copy
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.execution import file_hash
from content_production.framework_eval_runtime import MODEL, digest
from content_production.framework_harness.artifacts import (
    BASELINE, BudgetExhausted, Ledger, candidate, code_identity, prompt_for, read, validate_split, write,
)
from content_production.framework_harness.evaluate import Evaluator, validate_timeline
from content_production.framework_harness.feedback import reflection_feedback
from content_production.framework_harness.optimize import Adapter, FilmLoader, search
from content_production.framework_harness.runtime import ReplayMiss, Tape
from content_production.framework_v2 import review, rules
from content_production.segment_suggestion_provider import ProviderResult, SuggestionError


class Provider:
    model = MODEL

    def __init__(self):
        self.requests = []

    def review(self, prompt, schema, **kw):
        self.requests.append(prompt)
        return ProviderResult({'segments': [{'start': 0, 'end': 20, 'label': '实拍内容', 'reason': ''}]},
                              {'input_tokens': 5}, 'id')


def test_budget_is_durable_and_atomic_and_failed_calls_consume_it(tmp_path):
    path = tmp_path/'ledger.json'
    def claim(i):
        try:
            return Ledger(path, 3).reserve('review', str(i))
        except BudgetExhausted:
            return None
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(claim, range(20)))
    assert sorted(r for r in results if r) == [1, 2, 3]
    with pytest.raises(BudgetExhausted):
        Ledger(path, 3).reserve('reflection', 'x')
    with pytest.raises(ValueError):
        Ledger(path, 4).reserve('review', 'x')
    provider = Provider()
    tape = Tape(tmp_path/'tapes', Ledger(tmp_path/'failed-ledger', 1), live=True, provider=provider)
    with patch.object(provider, 'review', side_effect=SuggestionError('provider_error', 'private-secret')):
        with pytest.raises(SuggestionError):
            tape.review('a', {})
    assert len(read(tmp_path/'failed-ledger')['calls']) == 1
    assert 'private-secret' not in (tmp_path/'tapes/failed-calls/1.json').read_text()
    with pytest.raises(BudgetExhausted):
        tape.review('a', {})


def test_exact_replay_invalidates_changed_prompt_media_schema_and_sampling_namespace(tmp_path):
    media = tmp_path/'video.mp4'
    media.write_bytes(b'video')
    provider = Provider()
    live = Tape(tmp_path/'tapes', Ledger(tmp_path/'ledger', 2), live=True, provider=provider)
    expected = live.review('baseline', {'x': 1}, proxy=media)
    replay = Tape(tmp_path/'tapes', Ledger(tmp_path/'ledger', 0))
    assert replay.review('baseline', {'x': 1}, proxy=media) == expected
    for prompt, schema, fps in [('new', {'x': 1}, 2), ('baseline', {'x': 2}, 2), ('baseline', {'x': 1}, 1)]:
        with pytest.raises(ReplayMiss):
            replay.review(prompt, schema, proxy=media, fps=fps)
    media.write_bytes(b'changed')
    with pytest.raises(ReplayMiss):
        replay.review('baseline', {'x': 1}, proxy=media)
    with pytest.raises(ReplayMiss):
        Tape(tmp_path/'tapes', Ledger(tmp_path/'ledger', 0), namespace='fresh-1').review('baseline', {'x': 1})
    assert len(provider.requests) == 1


def test_concurrent_exact_requests_share_one_receipt(tmp_path):
    provider = Provider()
    tape = Tape(tmp_path/'tapes', Ledger(tmp_path/'ledger', 1), live=True, provider=provider)
    with ThreadPoolExecutor(6) as pool:
        results = list(pool.map(lambda _: tape.review('same', {}), range(10)))
    assert len(provider.requests) == 1
    assert len(results) == 10


def test_candidate_cannot_replace_kernel_and_split_rejects_renamed_same_source():
    assert prompt_for(BASELINE, 20) == review.PROMPT.format(dur=20)
    value = {'review_guidance': '检查{花括号}不会作为模板执行'}
    assert prompt_for(value, 20).startswith(review.PROMPT.format(dur=20))
    for invalid in [{'rules': 'new'}, {'review_guidance': 'a'*2001}, {'review_guidance': 2}]:
        with pytest.raises(ValueError):
            candidate(invalid)
    corpus = {'films': {'a': {'sourceSha256': 'same'}, 'b': {'sourceSha256': 'same'}}}
    with pytest.raises(ValueError):
        validate_split(corpus, ['a'], ['b'])
    corpus['films']['b']['sourceSha256'] = 'different'
    validate_split(corpus, ['a'], ['b'])
    for spans in [[[0, 9, 'x'], [10, 20, 'x']], [[0, float('nan'), 'x']], [[0, 19, 'x']]]:
        with pytest.raises(ValueError):
            validate_timeline(spans, 20, {'x'})


@pytest.fixture
def experiment(tmp_path):
    root = tmp_path/'capture'
    root.mkdir()
    films, rows, cases = {}, [], {}
    for film in ('train', 'validation'):
        work = root/film
        work.mkdir()
        clip = work/'review-0.mp4'
        clip.write_bytes(film.encode())
        films[film] = dict(file=film+'.mp4', sourceSha256=digest(film), segments=[[0, 20, '实拍内容']])
        obs = dict(durationMs=20000, sourceSha256=digest(film), cuts=[0, 20], runs=[[0, 20]], mouth=[],
            ruleSegments=[[0, 20, rules.LIVE]],
            clips=[dict(path=clip.name, sha256=file_hash(clip))],
            shots=[dict(start=0, end=20, chain=1, facts={}, ocr=[], kind='own', offer=False)])
        write(work/'observations.json', obs)
        cases[film] = file_hash(work/'observations.json')
        rows.append(dict(film=film, pred=[[0, 20, '实拍内容']], sourceSha256=digest(film)))
    corpus = dict(films=films, assertions=[], regressionCases=[], labels=[dict(key=rules.LIVE, name='实拍内容')],
                  gates=dict(minimum_accuracy=.9, maximum_regression=.02))
    write(root/'corpus.json', corpus)
    write(root/'baseline.json', rows)
    write(root/'manifest.json', dict(scope=list(films), cases=cases, code=code_identity(),
        corpusSha256=file_hash(root/'corpus.json'), baselineSha256=file_hash(root/'baseline.json')))
    tape = Tape(tmp_path/'tapes', Ledger(tmp_path/'ledger', 10), live=True, provider=Provider())
    return root, tape


def test_frozen_pipeline_replays_and_tampered_observation_is_rejected(experiment, tmp_path):
    root, tape = experiment
    evaluator = Evaluator(root, tmp_path/'output', tape)
    row = evaluator.one('train', BASELINE)
    assert row['pred'] == [[0, 20, '实拍内容']]
    tape.live = False
    assert evaluator.one('train', BASELINE)['pred'] == row['pred']
    with pytest.raises(ReplayMiss):
        evaluator.one('train', {'review_guidance': 'new'})
    (root/'train/observations.json').write_text('{}')
    with pytest.raises(ValueError):
        evaluator.one('train', BASELINE)


def test_validation_feedback_cannot_enter_proposer(experiment, tmp_path):
    pytest.importorskip('gepa')
    root, tape = experiment
    adapter = Adapter(Evaluator(root, tmp_path/'out', tape), ['train'], ['validation'], 1)
    batch = adapter.evaluate(['validation'], BASELINE, capture_traces=True)
    with pytest.raises(ValueError):
        adapter.make_reflective_dataset(BASELINE, batch, ['review_guidance'])
    batch = adapter.evaluate(['train'], BASELINE, capture_traces=True)
    feedback = adapter.make_reflective_dataset(BASELINE, batch, ['review_guidance'])
    assert 'film' not in json.dumps(feedback)


def test_real_gepa_adapter_search_runs_without_network(experiment, tmp_path):
    pytest.importorskip('gepa')
    root, tape = experiment
    provider = tape.provider
    original = provider.review
    def respond(prompt, schema, **kw):
        if 'review_guidance' in schema.get('properties', {}):
            return ProviderResult({'review_guidance': '先观察人物与来源，再核对连续片段。'}, {}, 'reflection')
        return original(prompt, schema, **kw)
    provider.review = respond
    evaluator = Evaluator(root, tmp_path/'opt', tape)
    result = search(evaluator, ['train'], ['validation'], max_proposals=1, max_metric_calls=8)
    assert result['optimizer'] == 'gepa-0.1.4'
    assert result['proposals'] == 1
    assert result['automaticAdoption'] is False
    assert any(c['kind'] == 'reflection' for c in read(tmp_path/'ledger')['calls'])


@pytest.mark.parametrize('name', ['source_sampling', 'source_pipeline', 'transition_sampling'])
def test_changed_native_sampling_cannot_replay_historical_facts(experiment, tmp_path, name):
    root, tape = experiment
    identities = code_identity()
    identities[f'content_production/framework_harness/{name}.py'] = 'changed-native-input-code'
    with patch('content_production.framework_harness.evaluate.code_identity', return_value=identities):
        with pytest.raises(ValueError, match='Frozen code'):
            Evaluator(root, tmp_path/'out', tape)
    assert tape.calls == []  # Rejection occurs before any provider/replay request.


def test_harness_reporting_change_does_not_invalidate_unchanged_observations(experiment, tmp_path):
    root, tape = experiment
    identities = code_identity()
    identities['content_production/framework_harness/feedback.py'] = 'changed-reporting-code'
    with patch('content_production.framework_harness.evaluate.code_identity', return_value=identities):
        Evaluator(root, tmp_path/'out', tape)


def test_per_film_regression_cannot_be_hidden_by_average(experiment, tmp_path):
    root, tape = experiment
    evaluator = Evaluator(root, tmp_path/'out', tape)
    rows = copy.deepcopy(evaluator.baseline)
    rows[0]['pred'] = [[0, 20, '混剪口播']]
    result = evaluator.score(rows, ['train', 'validation'])
    assert result['scopedPassed'] is False
    assert 'regression' in result['films'][0]['failures']
    assert all('stageHint' not in error for row in result['films'] for error in row['exactErrors'])


def test_gepa_dataset_ids_never_alias_train_and_validation():
    train, validation = FilmLoader(['a', 'b']), FilmLoader(['c', 'd'])
    assert not set(train.all_ids()) & set(validation.all_ids())
    with pytest.raises(ValueError):
        validation.fetch(['a'])


def test_real_gepa_selection_uses_validation_outputs_not_train_index_zero(tmp_path):
    pytest.importorskip('gepa')
    # Opposite outcomes under index zero reproduce the upstream list-cache trap.
    class EvaluatorStub:
        corpus = {'films': {'train': {'file': 'a.mp4', 'sourceSha256': 'a'},
                            'validation': {'file': 'b.mp4', 'sourceSha256': 'b'}}}
        baseline = [dict(film=f, pred=[]) for f in ('train', 'validation')]
        output = tmp_path
        def one(self, film, value):
            good = (film == 'train') == bool(value['review_guidance'])
            return dict(film=film, pred=[], accuracy=.9 if good else .1,
                        stages=dict(beforeReview=[], afterReview=[], afterRules=[], shots=[], windows=[]))
        def score(self, rows, scope):
            return dict(films=[dict(film=r['film'], candidate=r.get('accuracy', .1), failures=[], exactErrors=[])
                               for r in rows])
    def propose(self, *args):
        self.proposals += 1
        return {'review_guidance': 'general observation'}
    with patch.object(Adapter, 'propose_new_texts', propose):
        result = search(EvaluatorStub(), ['train'], ['validation'], max_proposals=1, max_metric_calls=5)
    assert result['selectedBaseline'] is True
    assert result['validationScores'] == [.9, .1]
    audit = read(tmp_path/'selection-audit.json')
    assert all(r['optimizer'] == r['recomputed'] for r in audit)


def test_evaluator_records_actual_intermediate_outputs(experiment, tmp_path):
    root, tape = experiment
    evaluator = Evaluator(root, tmp_path/'out', tape)
    row = evaluator.one('train', BASELINE)
    stages = row['stages']
    assert stages['beforeReview'] == read(root/'train/observations.json')['ruleSegments']
    assert stages['windows'][0]['response'] == Provider().review('', {}).payload['segments']
    assert stages['afterReview'] == [[0, 20, rules.LIVE]]
    assert stages['afterRules'] == [[0, 20, rules.LIVE]]
    assert read(next((tmp_path/'out/evaluations').glob('*/train.json')))['stages'] == stages


def test_reflection_uses_real_stages_and_excludes_grading_and_metadata():
    # Actual review said mixed; the final rule produced live. Never fabricate a
    # review-stage cause from the final error, even if the scorer hints at one.
    row = dict(stages=dict(beforeReview=[[0, 20, rules.MIXED]], afterReview=[[0, 20, rules.MIXED]],
        afterRules=[[0, 20, rules.LIVE]], windows=[dict(start=0, end=20, private='ignore', response=[
            dict(start=0, end=20, label='混剪口播', reason='短素材', private='ignore')])],
        shots=[dict(start=0, end=20, chain=1, kind='own', ocr=['快来直播间'],
                    facts={'subject': 'person', 'style': 'studio_ad', 'note': 'ignore'}, path='/private/ignore')]))
    error = dict(start=5, end=18, expected='混剪口播', actual='实拍内容', stageHint='misleading',
                 evidenceWindow=[0, 20], accuracy=.5, failures=['secret-guard'], private='ignore')
    output = reflection_feedback(row, [error])
    case = output['cases'][0]
    assert case['afterReview'] == [[0, 20, '混剪口播']]
    assert case['afterRules'] == [[0, 20, '实拍内容']]
    assert case['observations'][0]['ocr'] == ['快来直播间']
    text = json.dumps(output)
    assert all(term not in text for term in ('stageHint', 'evidenceWindow', 'accuracy', 'failures', 'ignore', 'secret'))
    assert reflection_feedback(row, [dict(error, withinAnnotationTolerance=True)])['cases'] == []
    assert reflection_feedback(row, [dict(error, resolvedByAdjudications=['owner'])])['cases'] == []
    assert reflection_feedback(row, [dict(error, outsideSourceVideo=True)])['cases'] == []
    with pytest.raises(ValueError, match='intermediate stages'):
        reflection_feedback(dict(pred=[]), [error])
    assert reflection_feedback(dict(error='provider_error'), [error])['status'] == 'execution_failed'


@pytest.mark.parametrize('text', ['边界误差在标注容差内可接受。', '以验证集准确率为准。', 'a'*241, 'train 的答案是实拍。'])
def test_proposer_rejects_grading_text_large_rewrites_and_identifiers(experiment, tmp_path, text):
    root, tape = experiment
    adapter = Adapter(Evaluator(root, tmp_path/'out', tape), ['train'], ['validation'], 1)
    with patch.object(tape, 'review', return_value=ProviderResult({'review_guidance': text}, {}, 'reflection')):
        with pytest.raises(ValueError):
            adapter.propose_new_texts(BASELINE, {'review_guidance': []}, ['review_guidance'])
    assert not (tmp_path/'out/proposals/1.json').exists()
