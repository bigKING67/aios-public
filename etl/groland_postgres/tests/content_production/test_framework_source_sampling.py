from fractions import Fraction
import json
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'scripts'))
from content_production.framework_harness import source_sampling as s


def table(pts=None, base='1/30000', origin=90000):
    pts = pts or [origin+i*1000 for i in range(90)]
    return s.frame_table(dict(streams=[dict(time_base=base)], frames=[
        dict(best_effort_timestamp=p, duration=1000) for p in pts]))


def test_native_pts_not_rounded_milliseconds_and_nonzero_origin():
    data = table()
    result = s.boundary(data, [30], 1.067, True)
    assert result['status'] == 'aligned'
    assert result['pts'] == 120000 and result['frame'] == 30
    assert s.source_time(data, 30) == Fraction(1)
    # Fractional cut at 1/30 must not become a rounded .033 second frame boundary.
    result = s.boundary(data, [1], .05, True)
    assert result['pts'] == 91000 and result['frame'] == 1


def test_multiple_candidates_and_missing_candidate_do_not_guess():
    data = table()
    assert s.boundary(data, [29, 31], 1.05, True)['status'] == 'ambiguous'
    assert s.boundary(data, [20], 1.05, True)['status'] == 'unresolved'
    row = s.boundary(data, [30], 1.05, False)
    assert row['status'] == 'observation_division' and row['frame'] == 32


def test_synthetic_divisions_and_short_insert_are_not_erased():
    data = table()
    case = dict(id='fixture', sourceSha256='source', intervals=[[0, 1], [1, 1.1], [1.1, 3]], physicalCuts=[])
    result = s.align_case(case, dict(sourceSha256='source', table=data, sceneFrames=[31, 32]))
    assert result['ready']
    assert result['units'][1] == dict(group='B', startFrame=30, endFrameExclusive=33, internalSceneFrames=[31, 32])
    assert all(b['status']=='observation_division' for b in result['boundaries'])


def test_collapse_and_wrong_source_rejected():
    data = table()
    case = dict(id='fixture', sourceSha256='source', intervals=[[0, 1], [1, 1.1], [1.1, 3]], physicalCuts=[1, 1.1])
    obs = dict(sourceSha256='source', table=data, sceneFrames=[31])
    with pytest.raises(ValueError, match='collapses'): s.align_case(case, obs)
    obs['sourceSha256'] = 'different'
    with pytest.raises(ValueError, match='source-bound'): s.align_case(case, obs)


@pytest.mark.parametrize('pts', [[0, 1, 1], [0, 2, 1], []])
def test_bad_pts_fail_closed(pts):
    with pytest.raises(ValueError):
        s.frame_table(dict(streams=[dict(time_base='1/30')], frames=[dict(best_effort_timestamp=p,duration=1) for p in pts]))


def test_vfr_export_checks_every_timestamp_not_average_fps():
    source = table([9000, 9010, 9030, 9070, 9100], '1/1000')
    clip = dict(timeBase='1/1000', originPts=0, pts=[0, 20, 60], endPts=90)
    s.verify_clip(source, clip, 1, 4)
    clip['pts'] = [0, 30, 60]  # Same frame count and endpoints, wrong middle frame timing.
    with pytest.raises(ValueError, match='timestamps drift'): s.verify_clip(source, clip, 1, 4)
    clip['pts'] = [0, 60]
    with pytest.raises(ValueError, match='duplicated'): s.verify_clip(source, clip, 1, 4)


def test_coarse_output_timebase_cannot_hide_one_frame_error():
    source = table()
    clip = dict(timeBase='1/30', originPts=0, pts=[0, 2], endPts=3)
    with pytest.raises(ValueError, match='time base'): s.verify_clip(source, clip, 0, 2)


@pytest.mark.parametrize('seconds', [-1, float('nan'), float('inf'), 3.01])
def test_outside_or_invalid_boundary_rejected(seconds):
    with pytest.raises(ValueError): s.boundary(table(), [], seconds, True)


def test_real_export_half_open_native_frames(tmp_path):
    ffmpeg, ffprobe = shutil.which('ffmpeg-full') or shutil.which('ffmpeg'), shutil.which('ffprobe-full') or shutil.which('ffprobe')
    if not ffmpeg or not ffprobe: pytest.skip('FFmpeg tools required')
    source, clip = tmp_path/'source.mp4', tmp_path/'clip.mp4'
    subprocess.run([ffmpeg,'-v','error','-f','lavfi','-i','color=c=red:s=64x64:r=30:d=1',
        '-f','lavfi','-i','color=c=blue:s=64x64:r=30:d=1','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0',
        '-c:v','libx264','-pix_fmt','yuv420p',str(source)],check=True)
    observed = s.observe(source, s.file_hash(source), ffmpeg=ffmpeg, ffprobe=ffprobe)
    assert observed['sceneFrames'] == [30]
    assert s.boundary(observed['table'], [30], 1.067, True)['frame'] == 30
    subprocess.run(s.export_command(source, clip, 0, 30, ffmpeg), check=True)
    output = json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','v:0',
        '-show_entries','stream=time_base:frame=best_effort_timestamp,duration,pkt_duration','-of','json',str(clip)]))
    s.verify_clip(observed['table'], s.frame_table(output), 0, 30)
    # Decode every exported pixel: the first blue frame must not leak into the red interval.
    raw = subprocess.check_output([ffmpeg,'-v','error','-i',str(clip),'-vf','scale=1:1',
        '-pix_fmt','rgb24','-f','rawvideo','-'])
    assert len(raw) == 30*3
    assert all(raw[i] > 200 and raw[i+2] < 40 for i in range(0,len(raw),3))
