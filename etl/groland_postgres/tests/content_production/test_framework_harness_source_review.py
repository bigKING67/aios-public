import sys
import copy
import importlib.util
from types import SimpleNamespace
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_eval_runtime import digest
from content_production.framework_harness import source_review as probe
from content_production.framework_harness.source_routes import candidates
from content_production.framework_v2 import rules

INTERVALS = [[0, 10], [10, 12], [12, 25]]


def answer(ab='same_review', bc='same_review', ac='same_review'):
    return dict(a_to_b=ab, b_to_c=bc, a_to_c=ac,
                evidence={'A': '手持粉饼展示', 'B': '相同衣袖和粉饼使用特写', 'C': '展示前述上妆结果'},
                reason='操作和道具衔接支持连续展示')


def test_staged_research_calls_preserve_progress_and_charge_failures(tmp_path, monkeypatch):
    path = Path(__file__).resolve().parents[4]/'.trellis/tasks/10-18-framework-split-v2/research/harness/source_probe.py'
    spec = importlib.util.spec_from_file_location('source_probe_test', path)
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    source = tmp_path/'source'
    source.write_bytes(b'fixture media')
    board = tmp_path/'contact.jpg'
    board.write_bytes(b'fixture image')
    key = tmp_path/'key'
    key.write_text('test-only')
    cases = [dict(id=n, source=str(source), sourceSha256=runner.file_hash(source),
                  intervals=INTERVALS, physicalCuts=[10, 12], frameSha256=[['a', 'b']]*3,
                  board=dict(path=board.name, sha256=runner.file_hash(board))) for n in ('one', 'two')]
    runner.write(tmp_path/'cases.json', cases)
    runner.write(tmp_path/'expected.json', {})
    calls = []

    class FakeVlm:
        model = 'test-model'
        usage = {'requests': 0}
        session = SimpleNamespace(close=lambda: None)

        def _call(self, *args):
            calls.append(args)
            if len(calls) == 2:
                raise TimeoutError('provider error must stay redacted')
            return answer()

    # Distinct intervals ensure the two fixtures are distinct requests.
    cases[1]['intervals'] = [[0, 9], [9, 12], [12, 25]]
    cases[1]['physicalCuts'] = [9, 12]
    runner.write(tmp_path/'cases.json', cases)
    monkeypatch.setattr(runner.local_vlm, 'LocalVlm', FakeVlm)
    for name in ('FRAMEWORK_V2_VLM_BASE_URL', 'FRAMEWORK_V2_VLM_API_KEY', 'FRAMEWORK_V2_VLM_CONCURRENCY'):
        monkeypatch.setenv(name, '')
    args = SimpleNamespace(output=tmp_path, cases=['one', 'two'], round=1, endpoint='unused',
                           key_file=key, ledger=tmp_path/'ledger.json', protocol=None)
    with pytest.raises(ValueError):
        runner.select_cases(cases, ['missing'], 1)
    with pytest.raises(ValueError):
        runner.select_cases(cases, ['one', 'one'], 1)
    with pytest.raises(RuntimeError, match='redacted receipt'):
        runner.run(args)
    assert [r['case'] for r in runner.read(tmp_path/'results.json')] == ['one']
    assert len(runner.read(args.ledger)['calls']) == 2
    with pytest.raises(ValueError, match='Earlier attempt failed'):
        runner.run(args)
    assert len(calls) == 2  # no automatic retry and no rebilling the first response
    args.cases, args.round = ['two'], 2
    runner.run(args)
    assert len(runner.read(tmp_path/'results.json')) == 2
    assert len(runner.read(args.ledger)['calls']) == 3
    runner.run(args)
    assert len(calls) == 3
    saved = runner.read(tmp_path/'results.json')
    saved[0]['status'] = 'tampered'
    runner.write(tmp_path/'results.json', saved)
    args.cases, args.round = ['one'], 1
    with pytest.raises(ValueError, match='differ from their receipt'):
        runner.run(args)
    # A structurally invalid model answer must survive validation failure,
    # so diagnostics do not require a second billed request.
    args.cases, args.round = ['two'], 3
    monkeypatch.setattr(FakeVlm, '_call', lambda *_: {'invalid': 'observed answer'})
    with pytest.raises(RuntimeError, match='redacted receipt'):
        runner.run(args)
    captured = list((tmp_path/'raw'/'3').glob('*.json'))
    assert len(captured) == 1
    assert runner.read(captured[0])['payload'] == {'invalid': 'observed answer'}
    assert runner.read(tmp_path/'failed'/'4.json')['stage'] == 'validation'
    with pytest.raises(ValueError, match='Earlier attempt failed'):
        runner.run(args)
    assert len(runner.read(args.ledger)['calls']) == 4


def test_visible_anchor_policy_does_not_count_missing_duplicate_or_conflicting_support(monkeypatch):
    path = Path(__file__).resolve().parents[4]/'.trellis/tasks/10-18-framework-split-v2/research/harness'
    monkeypatch.syspath_prepend(str(path))
    import anchor_probe
    raw = dict(facts={'A': '衣袖', 'B': '产品', 'C': '衣袖'}, comparisons={e: [] for e in probe.EDGES})
    witness = dict(kind='clothing_accessories', left='白衣', right=None, relation='contradiction')
    raw['comparisons']['a_to_b'] = [witness]
    assert anchor_probe.interpret(raw, INTERVALS, [10, 12])['status'] == 'abstain'

    witness = dict(witness, right='白衣', relation='consistent')
    for e in probe.EDGES:
        raw['comparisons'][e] = [witness, dict(witness)]
    assert anchor_probe.interpret(raw, INTERVALS, [10, 12])['status'] == 'abstain'
    for e in probe.EDGES:
        raw['comparisons'][e][1] = dict(witness, kind='set_objects')
    assert anchor_probe.interpret(raw, INTERVALS, [10, 12])['status'] == 'advisory'
    raw['comparisons']['a_to_b'].append(dict(witness, relation='contradiction'))
    assert anchor_probe.interpret(raw, INTERVALS, [10, 12])['status'] == 'abstain'


@pytest.fixture
def native_video_fixture(tmp_path, monkeypatch):
    path = Path(__file__).resolve().parents[4]/'.trellis/tasks/10-18-framework-split-v2/research/harness'
    monkeypatch.syspath_prepend(str(path))
    import native_video_probe as native
    source = tmp_path/'source.mp4'
    source.write_bytes(b'original')
    clip = tmp_path/'clip.mp4'
    clip.write_bytes(b'bounded clip')
    frame = tmp_path/'frame.png'
    frame.write_bytes(b'image fixture')
    case = dict(id='m015-tail', split='discovery', source=str(source), sourceSha256=native.file_hash(source),
        clip=clip.name, clipSha256=native.file_hash(clip), intervals=[[30,40],[40,42],[42,55]], physicalCuts=[40,42],
        frames=[dict(index=i,seconds=i/30,path=frame.name,sha256=native.file_hash(frame)) for i in range(8)])
    args = SimpleNamespace(output=tmp_path,case=case['id'],mode='video')
    native.write(tmp_path/'cases.json',[case])
    native.write(tmp_path/'expected.json',{})
    native.write(tmp_path/'plan.json',dict(casesSha256=native.file_hash(tmp_path/'cases.json'),
        expectedSha256=native.file_hash(tmp_path/'expected.json'),protocolCode={
        'native_video_probe.py':native.file_hash(Path(native.__file__)),
        'source_review.py':native.file_hash(Path(native.probe.__file__))}))
    native.write(tmp_path/'local-calls.json',dict(maximum=12,calls=[]))
    return native,args,case


def test_native_video_body_and_timestamps_are_distinct_from_image_sequence(native_video_fixture):
    native,args,case = native_video_fixture
    video, vid = native.request(args,case,'video','test-model')
    images, img = native.request(args,case,'images','test-model')
    assert [r['type'] for r in video['messages'][0]['content']] == ['video_url','text']
    assert 'mm_processor_kwargs' not in video
    assert vid['mmProcessorKwargs'] is None
    assert sum(r['type']=='image_url' for r in images['messages'][0]['content']) == 8
    assert 'A=0.000至10.000秒' in vid['prompt']
    assert 'C=12.000至25.000秒' in vid['prompt']
    assert native.digest(vid) != native.digest(img)
    assert native.selected_indices(8) == list(range(8))
    with pytest.raises(ValueError): native.selected_indices(7)
    Path(case['source']).write_bytes(b'changed')
    with pytest.raises(ValueError,match='changed'): native.request(args,case,'video','test-model')


def test_native_video_is_blocked_before_inference_without_verified_service_window(native_video_fixture,monkeypatch):
    native,args,_ = native_video_fixture
    monkeypatch.setattr(native.local_vlm,'LocalVlm',lambda: pytest.fail('No model initialization before runtime gate'))
    with pytest.raises(FileNotFoundError): native.run(args)
    assert native.read(args.output/'local-calls.json')['calls'] == []


def test_video_sampling_is_bound_independently_of_eight_image_controls(native_video_fixture):
    native,args,case = native_video_fixture
    case['videoFrames'] = [dict(index=i,seconds=i/30,rgbSha256=str(i)) for i in range(16)]
    video,identity = native.request(args,case,'video','test-model')
    images,control = native.request(args,case,'images','test-model')
    assert len(identity['frames']) == 16
    assert len(control['frames']) == 8
    assert sum(item['type']=='image_url' for item in images['messages'][0]['content']) == 8
    assert 'mm_processor_kwargs' not in video


def test_video_rejects_stale_eight_frame_runtime_for_sixteen_frame_plan(native_video_fixture,monkeypatch):
    native,args,case = native_video_fixture
    case['videoFrames'] = [dict(index=i) for i in range(16)]
    native.write(args.output/'cases.json',[case])
    plan=native.read(args.output/'plan.json')
    plan.update(casesSha256=native.file_hash(args.output/'cases.json'),serverVideoFrames=16)
    native.write(args.output/'plan.json',plan)
    native.write(args.output/'authorized-video-runtime.json',dict(videoCount=1,decodedFrames=8))
    monkeypatch.setattr(native.local_vlm,'LocalVlm',lambda:pytest.fail('No model before runtime validation'))
    with pytest.raises(ValueError,match='runtime'):native.run(args)
    assert native.read(args.output/'local-calls.json')['calls']==[]


def test_direct_decoder_count_alone_cannot_authorize_native_inference(native_video_fixture,monkeypatch):
    native,args,_ = native_video_fixture
    native.write(args.output/'authorized-video-runtime.json',dict(videoCount=1,decodedFrames=8))
    monkeypatch.setattr(native.local_vlm,'LocalVlm',lambda:pytest.fail('No model before complete decoder proof'))
    with pytest.raises(ValueError,match='model-aware decoder'):native.run(args)
    assert native.read(args.output/'local-calls.json')['calls']==[]


@pytest.mark.parametrize('http_error', [False, True])
def test_native_video_keeps_invalid_raw_response_and_does_not_retry(native_video_fixture,monkeypatch,http_error):
    native,args,_ = native_video_fixture
    args.mode='images'
    # Avoid touching a real credential in this isolated runner test.
    monkeypatch.setattr(Path,'home',lambda:args.output)
    key=args.output/'.config/aios/desktop-vlm.key'
    key.parent.mkdir(parents=True)
    key.write_text('test-only')
    for name in ('FRAMEWORK_V2_VLM_BASE_URL','FRAMEWORK_V2_VLM_API_KEY'):
        monkeypatch.setenv(name,'')
    class Response:
        status_code=400 if http_error else 200
        text='Unsupported video: test-only data:video/mp4;base64,PRIVATE_PAYLOAD'
        def raise_for_status(self):
            if http_error: raise ValueError('HTTP error fixture')
        def json(self):return {'model':'test-model','choices':[{'message':{'content':'invalid-json'}}],'usage':{}}
    session=SimpleNamespace(post=lambda *a,**kw:Response(),close=lambda:None)
    monkeypatch.setattr(native.local_vlm,'LocalVlm',lambda:SimpleNamespace(session=session,model='test-model'))
    with pytest.raises(RuntimeError,match='no automatic retry'):native.run(args)
    receipt=native.read(next((args.output/'responses').glob('*.json')))
    if http_error:
        assert receipt['stage']=='http_error_received'
        assert receipt['httpError']=='Unsupported video: [REDACTED_KEY] [REDACTED_MEDIA]'
        assert 'PRIVATE_PAYLOAD' not in str(receipt)
        assert len(receipt['httpErrorSha256'])==64
    else:
        assert receipt['response']['choices'][0]['message']['content']=='invalid-json'
        assert receipt['stage']=='response_received'
    with pytest.raises(ValueError,match='Already attempted'):native.run(args)
    assert len(native.read(args.output/'local-calls.json')['calls'])==1


def test_source_review_preserves_own_closeups_and_price_endings():
    result = probe.advisory(answer(), INTERVALS, [10, 12])
    assert result['status'] == 'advisory'
    assert result['candidateBoundaries'] == []
    assert result['automaticAdoption'] is False


def test_independent_insert_suggests_only_existing_physical_cuts():
    result = probe.advisory(answer('independent_material', 'independent_material'), INTERVALS, [10, 12])
    assert result['candidateBoundaries'] == [10, 12]
    assert 'label' not in result
    absent_cut = probe.advisory(answer('independent_material', 'independent_material'), INTERVALS, [10])
    assert absent_cut['status'] == 'abstain'
    assert absent_cut['candidateBoundaries'] == []


@pytest.mark.parametrize('payload', [answer('uncertain'), answer(ac='independent_material'),
    answer('independent_material', ac='same_review')])
def test_uncertain_and_contradictory_relations_abstain(payload):
    result = probe.advisory(payload, INTERVALS, [10, 12])
    assert result['status'] == 'abstain'
    assert not result['candidateBoundaries']


@pytest.mark.parametrize('payload', [None, {}, dict(answer(), label='机制'),
    dict(answer(), a_to_b='promotion'), dict(answer(), evidence={'A': 'x'}),
    dict(answer(), reason=''), dict(answer(), evidence=dict(A='', B='x', C='x'))])
def test_missing_invalid_or_classification_answers_fail(payload):
    with pytest.raises(ValueError):
        probe.advisory(payload, INTERVALS, [10, 12])


def test_request_identity_tracks_source_frames_sampling_physical_cuts_and_code():
    base = dict(source_sha='source', intervals=INTERVALS, frame_hashes=[['a', 'b'], ['c', 'd'], ['e', 'f']],
                physical_cuts=[10, 12], model='local-model', execution_code={'runner': 'v1'})
    key = digest(probe.request_identity(**base))
    for field, changed in [('source_sha', 'other'), ('frame_hashes', [['a', 'new'], ['c', 'd'], ['e', 'f']]),
                           ('physical_cuts', [10]), ('model', 'other'), ('execution_code', {'runner': 'v2'})]:
        assert digest(probe.request_identity(**dict(base, **{field: changed}))) != key
    for frames in ([['a', 'b'], ['c', 'd']], [['a', 'b'], ['c', None], ['e', 'f']]):
        with pytest.raises(ValueError):
            probe.request_identity(**dict(base, frame_hashes=frames))


def test_single_board_and_video_use_unambiguous_input_coordinates():
    assert 'A1、A2、B1、B2、C1、C2' in probe.PROMPT
    assert '不是比较每组内部左右两帧' in probe.PROMPT
    text = probe.video_prompt([[30, 40], [40, 42], [42, 55]])
    assert 'A=0.000至10.000秒' in text
    assert 'C=12.000至25.000秒' in text
    assert '只有一张六格图' not in text


@pytest.mark.parametrize('intervals', [[[0, 1], [2, 3], [3, 4]], [[0, 1], [1, 2], [2, float('nan')]],
    [[0, 1], [1, 2], [2, 2]], [[0, 1], [1, 2]], [[-1, 1], [1, 2], [2, 3]]])
def test_invalid_sampling_intervals_are_rejected(intervals):
    with pytest.raises(ValueError):
        probe.sample_times(intervals)


def test_joined_chain_conflict_is_reviewable_without_changing_labels():
    shots = [dict(start=0, end=10, chain=1, kind='own'), dict(start=10, end=12, chain=None, kind='ad'),
             dict(start=12, end=25, chain=1, kind='own')]
    segments = [[0, 25, rules.LIVE]]
    original = copy.deepcopy((shots, segments))
    found = candidates(segments, shots)
    assert len(found) == 1
    assert found[0]['shotIndices'] == [0, 1, 2]
    assert found[0]['automaticAdoption'] is False
    assert (shots, segments) == original
    # Correctly separated intervals need no reopening; absent/different chain
    # evidence does not enter this narrowly scoped joined-chain route.
    assert not candidates([[0, 12, rules.MIXED], [12, 25, rules.LIVE]], shots)
    shots[2]['chain'] = 2
    assert not candidates(segments, shots)
