import copy
from pathlib import Path
import shutil
import subprocess
import sys

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_eval_runtime import digest
from content_production.framework_harness import source_sampling as s, transition_sampling as t
from content_production.framework_harness.artifacts import write
from content_production.framework_harness.source_pipeline import NativeFrames, NativeSampling, UnresolvedSampling
from content_production.framework_v2 import persons, local_vlm, ocr, pipeline


def review_for(observation, cuts, band=(30, 45)):
    return dict(version=t.VERSION, sourceSha256=observation['sourceSha256'],
        tableSha256=digest(observation['table']), reviewer='synthetic-fixture', entries=[dict(
            index=0, requestedSeconds=cuts[0], kind='transition', excludeFrames=list(band),
            reason='Synthetic white transition frames',
            evidence=dict(sourceFrameRange=[28, 48], image='board.png', imageSha256='fixture'))])


@pytest.fixture
def transition_source(tmp_path):
    ffmpeg = shutil.which('ffmpeg-full') or shutil.which('ffmpeg')
    ffprobe = shutil.which('ffprobe-full') or shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        pytest.skip('FFmpeg required for actual transition frame test')
    source = tmp_path/'transition.mp4'
    subprocess.run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=30:d=1',
        '-f', 'lavfi', '-i', 'color=c=white:s=64x64:r=30:d=0.5',
        '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=30:d=1.5',
        '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0', '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p', str(source)], check=True)
    observation = s.observe(source, s.file_hash(source), ffmpeg=ffmpeg, ffprobe=ffprobe)
    return source, observation


def test_all_static_stage_inputs_avoid_reviewed_transition_and_preserve_timeline(transition_source):
    source, observation = transition_source
    reviews = review_for(observation, [1.25])
    sample = NativeSampling(observation, [1.25], 3000, reviews)
    cuts, spans = sample.layout(source, [1.25], 3000)
    assert cuts == [38/30] and spans == [(0, 38/30), (38/30, 3)]
    assert sample.plan['boundaries'][0]['anchorMeaning'] == 'provisional_timeline_marker_not_a_hard_cut'
    assert [(r['safeStartFrame'], r['safeEndFrameExclusive']) for r in sample.plan['spans']] == [(0, 30), (45, 90)]
    frames = sample.decode(source, pipeline.frame_requests(spans), lambda: None)
    requests = dict(persons=persons.frame_requests(spans), facts=local_vlm.fact_requests(spans),
        pairs=local_vlm.pair_requests(np.array([a for a, _ in spans], np.float32),
                                    np.array([b for _, b in spans], np.float32)),
        ocr=ocr.frame_requests(spans))
    for stage, items in requests.items():
        assert items, stage
        for time, width in items:
            index = frames.index(time)
            assert not 30 <= index < 45, (stage, time, index)
            pixel = frames.get(time, width)[0, 0]
            assert min(pixel) < 20  # White transition would have all three channels above 200.
    assert any(30 <= row['requestedSourceFrame'] < 45 for row in frames.receipts)
    assert all(row['anchor']['pts'] == observation['table']['pts'][row['sourceFrame']] for row in frames.receipts)
    assert s.file_hash(source) == observation['sourceSha256']
    assert sample.receipt['inputSha256']
    changed = copy.deepcopy(reviews)
    changed['entries'][0]['excludeFrames'][1] += 1
    assert NativeSampling(observation, [1.25], 3000, changed).plan['planSha256'] != sample.plan['planSha256']


@pytest.mark.parametrize('base,pts,expected,display', [
    ('1/30', [60, 61], '1/30', '0.03333'),
    ('1/30000', [90000, 91001], '1001/30000', '0.03337'),
    ('1/100000', [700000, 700001], '1/100000', '0.00001'),
])
def test_exact_anchors_preserve_clock_and_nonzero_origin(base, pts, expected, display):
    table = dict(timeBase=base, pts=pts, originPts=pts[0], endPts=pts[-1]+1)
    anchor = s.time_anchor(table, 1)
    assert anchor == dict(frame=1, pts=pts[1], timeBase=base, secondsExact=expected, secondsDecimal=display)
    assert s.time_anchor(table, 2)['pts'] == table['endPts']
    for frame in (-1, 3, 1.0):
        with pytest.raises(ValueError): s.time_anchor(table, frame)


def test_rounding_milliseconds_is_not_used_for_frame_selection():
    frames = NativeFrames.__new__(NativeFrames)
    frames.table = dict(timeBase='1/30000', pts=[90000, 91000, 92000], originPts=90000, endPts=93000)
    frames.times = [float(s.source_time(frames.table, i)) for i in range(3)]
    assert frames.index(1/30) == 1
    assert frames.index(round(1/30, 3)) == 0  # Demonstrates the rounding error, not a desired policy.


def test_vfr_three_frame_safe_core_retains_three_distinct_fact_frames():
    frames = NativeFrames.__new__(NativeFrames)
    frames.table = dict(timeBase='1/1000', pts=[0, 100, 110, 120, 900], originPts=0, endPts=1000)
    frames.times = [float(s.source_time(frames.table, i)) for i in range(5)]
    frames.safe_spans = [dict(seconds=[0, 1], guarded=True, safeStartFrame=1, safeEndFrameExclusive=4)]
    frames.span_starts = [0]
    assert [frames.index(time) for time in local_vlm.fact_times(0, 1)] == [1, 2, 3]


@pytest.mark.parametrize('side', ['left', 'right'])
def test_insufficient_safe_core_does_not_drop_short_content(transition_source, side):
    source, observation = transition_source
    reviews = review_for(observation, [1.25])
    if side == 'right':
        # Only one stable frame remains; never hide that by repeating it three times.
        reviews['entries'][0]['excludeFrames'][1] = 89
        reviews['entries'][0]['evidence']['sourceFrameRange'][1] = 90
    else:
        reviews['entries'][0]['excludeFrames'][0] = 1
    reviews['entries'][0]['evidence']['sourceFrameRange'][0] = 0
    sample = NativeSampling(observation, [1.25], 3000, reviews)
    assert len(sample.plan['spans']) == 2
    assert dict(shot=1 if side == 'right' else 0,
                reason='insufficient_stable_frames_requires_review') in sample.plan['problems']
    with pytest.raises(UnresolvedSampling): sample.decode(source, [(0.1, 32)], lambda: None)


def test_omitted_internal_cut_blocks_models_without_inventing_a_new_cut(transition_source):
    source, observation = transition_source
    observation['sceneFrames'].append(15)
    sample = NativeSampling(observation, [1.25], 3000, review_for(observation, [1.25]))
    assert sample.plan['staticSamplingReady'] and not sample.plan['ready']
    assert len(sample.plan['boundaries']) == 1 and len(sample.plan['spans']) == 2
    assert dict(shot=0, reason='internal_scene_candidates_require_review', frames=[15]) in sample.plan['problems']
    with pytest.raises(UnresolvedSampling): sample.decode(source, [(0.1, 32)], lambda: None)


def internal_review(frame, kind='hard_cut'):
    return dict(frame=frame, kind=kind, reason='Synthetic source-frame review',
        evidence=dict(sourceFrameRange=[frame-1, frame+2], image='board.png', imageSha256='fixture'))


def test_reviewed_internal_cuts_separate_actual_content_without_splitting_noncut(transition_source):
    source, observation = transition_source
    observation['sceneFrames'] = [15, 30, 45]
    reviews = review_for(observation, [1.25])
    reviews['entries'] = []
    reviews['internalEntries'] = [internal_review(30), internal_review(45),
                                 internal_review(15, 'non_cut_scene_response')]
    sample = NativeSampling(observation, [], 3000, reviews)
    cuts, spans = sample.layout(source, [], 3000)
    assert cuts == [1, 1.5] and spans == [(0, 1), (1, 1.5), (1.5, 3)]
    assert all(row['status'] == 'reviewed_hard_cut' for row in sample.plan['boundaries'])
    frames = sample.decode(source, pipeline.frame_requests(spans), lambda: None)
    # Every fact input now belongs to the correct red, white or blue interval.
    for shot, (a, b) in enumerate(spans):
        for time in local_vlm.fact_times(a, b):
            pixel = frames.get(time, local_vlm.FACT_WIDTH)[0, 0]
            if shot == 0: assert pixel[2] > 200 and pixel[0] < 20
            elif shot == 1: assert min(pixel) > 200
            else: assert pixel[0] > 200 and pixel[2] < 20


@pytest.mark.parametrize('failure', ['unobserved', 'duplicate', 'missing_context', 'kind', 'short_insert'])
def test_internal_review_cannot_invent_or_hide_content(transition_source, failure):
    source, observation = transition_source
    reviews = review_for(observation, [1.25])
    reviews['entries'] = []
    entry = internal_review(30)
    reviews['internalEntries'] = [entry, internal_review(45)]
    if failure == 'unobserved': entry['frame'] = 20
    elif failure == 'duplicate': reviews['internalEntries'].append(copy.deepcopy(entry))
    elif failure == 'missing_context': entry['evidence']['sourceFrameRange'] = [30, 31]
    elif failure == 'kind': entry['kind'] = 'merge_everything'
    else:
        observation['sceneFrames'].append(1)
        reviews['internalEntries'].append(internal_review(1))
        sample = NativeSampling(observation, [], 3000, reviews)
        assert len(sample.plan['spans']) == 4
        with pytest.raises(UnresolvedSampling): sample.decode(source, [(0.1, 32)], lambda: None)
        return
    with pytest.raises(ValueError): NativeSampling(observation, [], 3000, reviews)


@pytest.mark.parametrize('change', ['source', 'table', 'index', 'request', 'evidence', 'band', 'duplicate'])
def test_review_cannot_silently_apply_to_different_source_or_boundary(transition_source, change):
    _, observation = transition_source
    reviews = review_for(observation, [1.25])
    entry = reviews['entries'][0]
    if change == 'source': reviews['sourceSha256'] = 'wrong'
    elif change == 'table': reviews['tableSha256'] = 'wrong'
    elif change == 'index': entry['index'] = 1
    elif change == 'request': entry['requestedSeconds'] = 1.1
    elif change == 'evidence': entry['evidence']['sourceFrameRange'] = [2, 20]
    elif change == 'band': entry['excludeFrames'] = [47, 49]
    elif change == 'duplicate': reviews['entries'].append(copy.deepcopy(entry))
    with pytest.raises(ValueError): NativeSampling(observation, [1.25], 3000, reviews)


def test_reviewed_observation_division_preserves_media_and_does_not_claim_hard_cut(transition_source):
    _, observation = transition_source
    reviews = review_for(observation, [1.25])
    reviews['entries'][0].update(kind='observation_division', excludeFrames=None)
    sample = NativeSampling(observation, [1.25], 3000, reviews)
    assert sample.plan['staticSamplingReady']
    assert not sample.plan['ready']  # Independent internal scene evidence still requires review.
    assert sample.plan['boundaries'][0]['status'] == 'reviewed_observation_division'
    assert all(not span['guarded'] for span in sample.plan['spans'])
    reviews['entries'][0]['excludeFrames'] = [30, 45]
    with pytest.raises(ValueError): NativeSampling(observation, [1.25], 3000, reviews)


def test_review_file_rejects_changed_or_escaped_evidence(tmp_path):
    image = tmp_path/'board.png'
    image.write_bytes(b'fixture')
    reviews = dict(entries=[dict(evidence=dict(image=image.name, imageSha256=s.file_hash(image)))])
    path = tmp_path/'reviews.json'
    write(path, reviews)
    assert t.load_reviews(path) == reviews
    image.write_bytes(b'changed')
    with pytest.raises(ValueError, match='changed'): t.load_reviews(path)
    reviews['entries'][0]['evidence']['image'] = '../elsewhere.png'
    write(path, reviews)
    with pytest.raises(ValueError, match='escaped'): t.load_reviews(path)
