"""Bounded selected-window fidelity, never semantic or delivery approval."""
from fractions import Fraction
from pathlib import Path
import re
import subprocess
import time

from .caption_quality import document_digest
from .derived_assets import document_media
from .execution import renderer_env
from .source_text_compatibility import assess_source_text, source_offset


def review(snapshot, media, video, receipt, work, tick, lock_fd=None):
    document = snapshot.get('editDocument')
    if not document or document.get('captionOverlayPolicy') != 'preserve-source-picture-v1':
        return None
    routing = assess_source_text(document)
    routes = [r for r in routing['routes'] if r['action'] == 'inspect_source_text']
    if not routes:
        return None
    files = document_media(snapshot, media)
    tracks = {t['id']: t['kind'] for t in document['tracks']}
    assets = {a['ref']: a for a in document['assets']}
    sound = [c for c in document['clips'] if tracks[c['trackId']] == 'audio']
    pictures = [c for c in document['clips'] if tracks[c['trackId']] == 'video']
    windows, remaining = [], 300
    for route in routes:
        tick()
        start, end = route['startFrame'], route['endFrame']
        frames = end - start
        window = dict(route, fidelity='unverified', semantic='unverified', narration=[])
        for clip in sound:
            lo, hi = max(start, clip['timeline']['startFrame']), min(end, clip['timeline']['endFrame'])
            if hi > lo:
                offset = source_offset(clip)
                def rational(value):
                    return {'num': value.numerator, 'den': value.denominator}
                asset = assets[clip['assetRef']]
                window['narration'].append({'clipId': clip['id'], 'assetVersionId': asset['assetVersionId'],
                    'sha256': asset['sha256'], 'startFrame': lo, 'endFrame': hi,
                    'sourceStart': rational(offset + Fraction(lo, 30)), 'sourceEnd': rational(offset + Fraction(hi, 30))})
        picture = next(c for c in pictures if c['id'] == route['clipId'])
        active = [c for c in pictures if c['timeline']['startFrame'] < end and c['timeline']['endFrame'] > start]
        simple = (len(active) == 1 and picture['transform'] == {'fit': 'contain', 'opacity': 1}
                  and not document['captions'] and not document['transitions'] and not document['templateRefs']
                  and not any(k in document for k in ('captionRepair', 'captionDisplayPolicy')))
        if not simple:
            window['reason'] = 'composition_requires_other_inspection'
        elif frames > 150 or frames > remaining:
            window['reason'] = 'bounded_fidelity_budget_exceeded'
        else:
            remaining -= frames
            metrics = measure(files[route['assetVersionId']], video, route, document['canvas'], work, len(windows), tick, lock_fd)
            window['measurement'] = metrics
            window['fidelity'] = 'matched' if metrics['minimumSSIM'] >= .95 else 'mismatch'
            window['reason'] = 'source_output_comparison_only'
        windows.append(window)
    return {'schema': 'aios.selected-source-quality.v1', 'documentSha256': document_digest(document),
            'outputSha256': receipt['host_inspection']['sha256'], 'status': 'inspection_required',
            'windows': windows, 'comparisonThreshold': .95, 'frameBudget': 300,
            'deferredChecks': ['source_text_semantics', 'product_identity', 'edit_quality', 'audio_visual_sync'],
            'deliveryApproved': False}


def measure(source, video, route, canvas, work, index, tick, lock_fd):
    start = Fraction(route['sourceStart']['num'], route['sourceStart']['den'])
    end = Fraction(route['sourceEnd']['num'], route['sourceEnd']['den'])
    frames = route['endFrame'] - route['startFrame']
    if end - start != Fraction(frames, 30):
        raise ValueError('selected source window must preserve playback speed')
    width, height = canvas['width'], canvas['height']
    stats = f'selected-fidelity-{index}.txt'
    graph = (f'[0:v]trim=start={float(start):.9f}:end={float(end):.9f},setpts=PTS-STARTPTS,fps=30,'
             f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black[a];'
             f"[1:v]trim=start_frame={route['startFrame']}:end_frame={route['endFrame']},setpts=PTS-STARTPTS[b];"
             f'[a][b]ssim=stats_file={stats}')
    work = Path(work).resolve()
    with (work / f'selected-fidelity-{index}.log').open('wb') as log:
        proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(Path(source).resolve()), '-i', str(Path(video).resolve()),
                                 '-filter_complex', graph, '-frames:v', str(frames), '-f', 'null', '-'],
                                cwd=work, env=renderer_env(work), stdout=subprocess.DEVNULL, stderr=log,
                                pass_fds=() if lock_fd is None else (lock_fd,))
        began = time.monotonic()
        try:
            while proc.poll() is None:
                tick()
                if time.monotonic() - began > 60:
                    raise TimeoutError('selected source inspection timed out')
                time.sleep(.1)
            if proc.returncode:
                raise ValueError('selected source inspection failed')
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill(); proc.wait()
    scores = [float(v) for v in re.findall(r'All:([\d.]+)', (work / stats).read_text())]
    if len(scores) != frames:
        raise ValueError('selected source inspection frame coverage incomplete')
    return {'frames': frames, 'minimumSSIM': min(scores), 'meanSSIM': sum(scores)/len(scores)}
