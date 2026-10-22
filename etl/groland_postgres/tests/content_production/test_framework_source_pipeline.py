import copy
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_harness import source_sampling as s
from content_production.framework_harness.source_pipeline import NativeFrames, NativeSampling, UnresolvedSampling
from content_production.framework_v2 import pipeline, rules


@pytest.fixture
def source(tmp_path):
    ffmpeg = shutil.which('ffmpeg-full') or shutil.which('ffmpeg')
    ffprobe = shutil.which('ffprobe-full') or shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        pytest.skip('FFmpeg required for native pipeline integration')
    path = tmp_path/'two-shots.mp4'
    subprocess.run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=30:d=1',
        '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=30:d=1',
        '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        str(path)], check=True)
    return path, s.observe(path, s.file_hash(path), ffmpeg=ffmpeg, ffprobe=ffprobe)


def test_native_decode_uses_half_open_boundary_and_freezes_actual_inputs(source):
    path, observation = source
    sample = NativeSampling(observation, [1.1], 2000)
    cuts, spans = sample.layout(path, [1.1], 2000)
    assert cuts == [1.0] and spans == [(0.0, 1.0), (1.0, 2.0)]
    frames = sample.decode(path, [(29/30, 32), (.999, 32), (1.0, 32)], lambda: None)
    assert [r['sourceFrame'] for r in frames.receipts] == [29, 29, 30]
    assert frames.get(.999, 32)[0, 0, 2] > 200  # Last red frame, not the following blue.
    assert frames.get(1.0, 32)[0, 0, 0] > 200
    first = sample.receipt['inputSha256']
    sample.decode(path, [(29/30, 64), (.999, 32), (1.0, 32)], lambda: None)
    assert sample.receipt['inputSha256'] != first
    assert observation['sceneFrames'] == [30]


def test_vfr_and_repeating_pts_choose_active_frame_without_average_fps():
    obj = NativeFrames.__new__(NativeFrames)
    obj.table = dict(timeBase='1/30000', originPts=90000, pts=[90000, 91000, 96000], endPts=99000)
    obj.times = [float(s.source_time(obj.table, i)) for i in range(3)]
    assert obj.index(1/30) == 1
    assert obj.index(.19) == 1
    assert obj.index(.2) == 2
    for bad in (-.01, .3, float('nan'), float('inf')):
        with pytest.raises(ValueError): obj.index(bad)


def test_missing_or_ambiguous_cuts_and_short_intervals_stop(source):
    path, observation = source
    for scene_frames, cuts in [([], [1.1]), ([29, 30], [1.1]), ([1], [.05])]:
        changed = dict(observation, sceneFrames=scene_frames)
        sample = NativeSampling(changed, cuts, 2000)
        assert not sample.plan['ready']
        with pytest.raises(UnresolvedSampling): sample.layout(path, cuts, 2000)
    with pytest.raises(ValueError, match='duration'):
        NativeSampling(observation, [1.1], 2500)


def test_different_source_proxy_or_duration_cannot_enter_plan(source, tmp_path):
    path, observation = source
    sample = NativeSampling(observation, [1.1], 2000)
    for cuts, duration in [([1.0], 2000), ([1.1], 1999)]:
        with pytest.raises(ValueError, match='differs'): sample.layout(path, cuts, duration)
    other = tmp_path/'other.mp4'
    other.write_bytes(b'changed source')
    with pytest.raises(ValueError, match='differs'): sample.layout(other, [1.1], 2000)
    observation['sceneFrames'].clear()  # Caller mutation must not change the accepted private copy.
    assert sample.layout(path, [1.1], 2000)[0] == [1.0]


def test_pipeline_recomputes_all_observers_on_native_inputs_and_preserves_default(source, tmp_path, monkeypatch):
    path, observation = source
    monkeypatch.setattr(pipeline.shots, 'cut_times', lambda _: [1.1])
    calls = []
    def features(frames, spans, tick):
        calls.append(('persons', spans))
        n = len(spans)
        return dict(start=np.array([a for a, _ in spans], np.float32),
            end=np.array([b for _, b in spans], np.float32), has_face=np.zeros(n, bool),
            has_torso=np.zeros(n, bool), bg=np.ones((n, 3)), modelSha256={})
    class Observers:
        model = 'fixture-only'
        usage = {}
        def same_person(self, *args): return []
        def shot_facts(self, frames, spans, tick):
            calls.append(('facts', spans))
            return [dict(subject='product', style='studio_ad', people_count=0,
                talking_to_camera=False, using_product=False, celebrity_tag=False, offer_text=False, note='')
                for _ in spans]
    def text(frames, spans, tick):
        calls.append(('ocr', spans))
        return [[] for _ in spans], 'fixture-only'
    def no_external_call(*args, **kwargs): raise AssertionError('Network call is forbidden')
    monkeypatch.setattr(pipeline.persons, 'extract', features)
    monkeypatch.setattr(pipeline.local_vlm, 'LocalVlm', Observers)
    monkeypatch.setattr(pipeline.ocr, 'shot_text', text)
    provider = SimpleNamespace(review=no_external_call)
    native, legacy = {}, {}
    sample = NativeSampling(observation, [1.1], 2000)
    args = (path, path, 2000, [rules.MIXED], provider, tmp_path, {}, lambda: None, [''])
    new, summary, _ = pipeline.run(*args, evidence_sink=native.update, sampling=sample)
    assert [r['start'] for r in native['shots']] == [0.0, 1.0]
    assert [kind for kind, _ in calls] == ['persons', 'facts', 'ocr']
    assert all(spans == [(0.0, 1.0), (1.0, 2.0)] for _, spans in calls)
    assert native['sampling'] == sample.receipt
    assert summary['sampling']['inputSha256'] == sample.receipt['inputSha256']
    calls.clear()
    old, summary, _ = pipeline.run(*args, evidence_sink=legacy.update)
    assert [r['start'] for r in legacy['shots']] == [0.0, 1.1]
    assert all(spans == [(0.0, 1.1), (1.1, 2.0)] for _, spans in calls)
    assert 'sampling' not in summary and 'sampling' not in legacy
    assert new == old  # Fixture label outcome is unchanged; this is not a real-model quality claim.


def test_pipeline_fails_before_models_when_plan_unresolved_or_evidence_missing(source, tmp_path, monkeypatch):
    path, observation = source
    monkeypatch.setattr(pipeline.shots, 'cut_times', lambda _: [1.1])
    def forbidden(*args, **kwargs): raise AssertionError('Model initialization must not happen')
    monkeypatch.setattr(pipeline.persons, 'extract', forbidden)
    monkeypatch.setattr(pipeline.local_vlm, 'LocalVlm', forbidden)
    bad = NativeSampling(dict(observation, sceneFrames=[]), [1.1], 2000)
    args = (path, path, 2000, [rules.MIXED], None, tmp_path, {}, lambda: None, [''])
    with pytest.raises(UnresolvedSampling):
        pipeline.run(*args, evidence_sink=lambda _: None, sampling=bad)
    with pytest.raises(ValueError, match='evidence sink'):
        pipeline.run(*args, sampling=bad)
