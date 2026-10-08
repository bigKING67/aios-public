"""Offline business-footage trial; a frozen recipe, not autonomous quality approval.

Reuse existing verified source/erasure files and reviewed captions. No API calls,
DB writes or automatic promotion of the derived media into the asset library.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from array import array
import math


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('pilot', 'module', 'chrome', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    sys.path.insert(0, str(repo / 'etl/groland_postgres/scripts'))
    from content_production.render_document import render_document_local
    from content_production.edit_document import resolve_caption_display
    root = args.pilot.resolve()
    bench = root / 'erasure-benchmark'
    baseline = json.loads((bench / 'reviewed-line-repair-live/edit-document.json').read_text())
    doc = copy.deepcopy(baseline)
    original = root / '4d5ab027-603e-5829-84cc-f18bd9c2b15f.mp4'
    original_asset = next(a for a in doc['assets'] if a['ref'] == 'source3')
    if digest(original) != original_asset['sha256']:
        raise ValueError('Narration source changed since caption review')
    files = {'source3': original, 'clean-hair': bench / 'moving-hair-caption/output.mp4'}
    assets, bindings, media = [], {}, {}
    for ref, path in files.items():
        sha = digest(path)
        version = original_asset['assetVersionId'] if ref == 'source3' else ref + '-' + sha[:16]
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]))
        assets.append({'ref': ref, 'assetVersionId': version, 'sha256': sha})
        bindings[version] = {'sha256': sha, 'durationMs': math.floor(float(probe['format']['duration']) * 1000)}
        media[version] = path
    narration = next(c for c in doc['clips'] if c['id'] == 'narration')
    total = narration['timeline']['endFrame']
    # Fixed pilot recipe: use complete reviewed cues entirely inside existing
    # four-second erasure excerpts; retain all other footage at original time.
    windows = [(627, 668, 'clean-hair', 27)]
    clips = []
    def picture(start, end, ref, source_start):
        clips.append({'id': f'picture-{start}', 'trackId': 'picture', 'assetRef': ref,
                      'timeline': {'startFrame': start, 'endFrame': end},
                      'sourceMap': [{'startFrame': 0, 'endFrame': end-start,
                                     'sourceStart': {'num': source_start, 'den': 30},
                                     'sourceEnd': {'num': source_start+end-start, 'den': 30}}],
                      'transform': {'fit': 'contain', 'opacity': 1}, 'audioPolicy': 'mute'})
    cursor = 0
    for start, end, ref, offset in windows:
        if start > cursor:
            picture(cursor, start, 'source3', cursor)
        picture(start, end, ref, offset)
        cursor = end
    picture(cursor, total, 'source3', cursor)
    doc.update(projectId='whitegold-real-footage-trial', revision=baseline['revision']+1,
               assets=assets, clips=clips+[narration])
    # Supply the complete caption plan. The production compiler decides which
    # intervals need overlays from source/time identity; no manual cue filtering.
    selected = copy.deepcopy(baseline['captions'])
    for cue in selected:
        cue['stylePreset'] = 'source-style-v1'
        cue['style'] = {'fontHeight': .035, 'centerY': .6875, 'color': '#ffffff', 'strokeWidth': .0015, 'weight': 900}
    doc['captions'] = selected
    doc['captionOverlayPolicy'] = 'preserve-source-picture-v1'
    display = resolve_caption_display(doc)
    rendered = [c for c in display if c['renderRanges']]
    if len(rendered) != 1:
        raise ValueError('Pilot overlay coverage changed; inspect source boundaries')
    for cue in display:
        for interval in cue['renderRanges']:
            if not any(lo <= interval['startFrame'] and interval['endFrame'] <= hi for lo, hi, _, _ in windows):
                raise ValueError('New caption overlaps retained source picture')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    (output / 'edit-document.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2))
    (output / 'bindings.json').write_text(json.dumps(bindings, indent=2))
    os.environ['PRODUCER_HEADLESS_SHELL_PATH'] = str(args.chrome.resolve())
    video, receipt = render_document_local(args.module.resolve(), doc, bindings, media,
                                           '白金洗发水真实画面完整试剪', output, False, lambda: None)
    (output / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    def pcm(path):
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-t', str(total/30),
                                       '-vn', '-f', 's16le', '-ar', '16000', '-ac', '1', '-'])
        return array('h', raw)
    source, result = pcm(original), pcm(video)
    n = min(len(source), len(result))
    if n < math.floor(total/30*16000)-1:
        raise AssertionError('Narration truncated')
    correlations = []
    for second in (0, 11, 12, 14, 20, 21, 22, 30, 48):
        lo, hi = second*16000, min((second+1)*16000, n)
        a, b = source[lo:hi], result[lo:hi]
        energy = sum(v*v for v in a)*sum(v*v for v in b)
        score = sum(x*y for x, y in zip(a, b))/math.sqrt(energy) if energy else 0
        if score < .98:
            raise AssertionError(f'Narration mismatch near {second}s')
        correlations.append({'second': second, 'correlation': score})
    report = {'scope': 'offline frozen business-footage trial; not autonomous planner or production delivery',
              'technicalInspection': receipt['host_inspection'], 'durationSeconds': total/30,
              'replacementSeconds': sum(hi-lo for lo, hi, _, _ in windows)/30,
              'crossAssetRemixSeconds': sum(hi-lo for lo,hi,_,_ in windows)/30, 'restoredCaptionCount': len(rendered),
              'captionPlanCount': len(selected), 'compilerRouted': True,
              'captionTextAndAnchorUnchanged': True, 'originalFootageAndBurnedSubtitlesRetainedSeconds': (total-sum(hi-lo for lo,hi,_,_ in windows))/30,
              'newCaptionStyle': 'source-style-v1; manually measured geometry, font identity unverified', 'newCaptionsOutsideCleanedWindows': False,
              'narrationCorrelationChecks': correlations, 'providerCalls': 0,
              'professionalQualityPassed': False, 'deliveryApproved': False,
              'limitations': ['retained footage still contains original burned-in copy',
                              'restored caption font is an approximation; original font project unavailable',
                              'exact SKU and product claims unverified',
                              'source authorization metadata unknown',
                              'full listening and motion-quality review pending']}
    (output / 'acceptance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({'video': str(video), 'seconds': total/30, 'technical': 'passed', 'deliveryApproved': False}))


if __name__ == '__main__':
    main()
