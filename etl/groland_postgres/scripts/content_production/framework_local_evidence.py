"""Opt-in offline framework evidence prototype; no labels, model API or worker changes.

Decode once at native frame rate. Retain scene-change candidates and a bounded
gap of stable frames, with actual source timestamps. Local face/fingerprint
signals are advisory: they cannot establish source continuity or review roles.
Only explicitly supplied, pinned OpenCV weights are loaded; nothing downloads.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import tempfile
import time
from pathlib import Path

from .execution import file_hash
from .segment_shot_hints import MAX_LOG_BYTES, parse_scored_cuts
from .segment_suggestion_provider import run_media
from .shot_catalog import probe

SCHEMA = 'aios.framework-local-evidence.prototype.v1'
MODEL_HASHES = {
    'face_detection_yunet_2023mar.onnx': '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    'face_recognition_sface_2021dec.onnx': '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
}
ZOO_REVISION = '47534e27c9851bb1128ccc0102f1145e27f23f98'
SCENE_THRESHOLD = .12
STABLE_GAP_SECONDS = 2
MAX_FRAMES = 1024
CPU_THREADS = 2


def pinned_models(root):
    models = []
    for name, digest in MODEL_HASHES.items():
        path = root / name
        if path.is_symlink() or not path.is_file() or file_hash(path) != digest:
            raise ValueError('Local model does not match pinned official weights')
        models.append({'name': name, 'sha256': digest, 'bytes': path.stat().st_size})
    return models


def extraction_command(source, frames, ffmpeg):
    # Scene scoring precedes selection and sees every decoded native-rate frame.
    # No fps filter / rounding to a synthetic 1fps timeline is permitted here.
    selection = (f'isnan(prev_selected_t)+gt(scene\\,{SCENE_THRESHOLD})+'
                 f'gte(t-prev_selected_t\\,{STABLE_GAP_SECONDS})')
    filters = ('scale=640:640:force_original_aspect_ratio=decrease,'
               f'select={selection},metadata=print:key=lavfi.scene_score')
    return [ffmpeg, '-nostdin', '-hide_banner', '-xerror', '-filter_threads', '1',
            '-threads', str(CPU_THREADS), '-i', str(source), '-map', '0:v:0', '-an',
            '-vf', filters, '-fps_mode', 'vfr', '-q:v', '3', '-frames:v', str(MAX_FRAMES + 1),
            '-threads', str(CPU_THREADS), str(frames / '%05d.jpg')]


def sampled_frames(log, frames, duration_ms):
    timings = parse_scored_cuts(log, 0)
    paths = sorted(frames.glob('*.jpg'))
    if not timings or len(timings) != len(paths) or len(paths) > MAX_FRAMES:
        raise ValueError('Incomplete or excessive local frame evidence; no manifest published')
    rows, previous = [], -1
    for index, ((at, score), path) in enumerate(zip(timings, paths)):
        if not previous < at < duration_ms or not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError('Invalid source frame timing or scene score')
        previous = at
        rows.append({'index': index, 'atMs': at, 'sceneScore': score,
                     'cutCandidate': at > 0 and score > SCENE_THRESHOLD,
                     'path': f'frames/{path.name}', 'sha256': file_hash(path)})
    return rows


def visual_signals(rows, work, model_root, tick):
    import cv2
    import numpy as np

    cv2.setNumThreads(CPU_THREADS)
    detector = cv2.FaceDetectorYN_create(str(model_root / 'face_detection_yunet_2023mar.onnx'),
                                        '', (320, 320), score_threshold=.9, nms_threshold=.3)
    recognizer = cv2.FaceRecognizerSF_create(str(model_root / 'face_recognition_sface_2021dec.onnx'), '')
    # A bounded per-film cache. Embeddings never leave memory, and no P1-style
    # identity aliases are shared across windows or videos.
    cache, pairs = {}, []
    for row in rows:
        tick()
        digest = row['sha256']
        if digest not in cache:
            image = cv2.imread(str(work / row['path']))
            if image is None:
                raise ValueError('Unreadable local frame')
            height, width = image.shape[:2]
            grey = cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (32, 32))
            low = cv2.dct(np.float32(grey))[:8, :8].reshape(-1)[1:]
            bits = low > np.median(low)
            fingerprint = f'{sum(int(bit) << i for i, bit in enumerate(bits)):016x}'
            detector.setInputSize((width, height))
            _, detected = detector.detect(image)
            faces = [] if detected is None else sorted(detected, key=lambda f: float(f[2] * f[3]), reverse=True)
            signal = {'detectedFaces': len(faces), 'status': 'uncertain'}
            vector = None
            if faces:
                face = faces[0]
                area = float(face[2] * face[3])
                signal.update(largestFaceAreaFraction=area / (width * height), detectionScore=float(face[-1]))
                if area >= .08 * width * height and (len(faces) == 1 or area >= 2 * float(faces[1][2] * faces[1][3])):
                    vector = recognizer.feature(recognizer.alignCrop(image, face)).reshape(-1).copy()
                    norm = float(np.linalg.norm(vector))
                    if not np.isfinite(vector).all() or not math.isfinite(norm) or norm <= 0:
                        raise ValueError('Invalid local face feature')
                    vector /= norm
                    signal['status'] = 'dominant_face_feature'
            cache[digest] = signal, vector, fingerprint
        signal, vector, fingerprint = cache[digest]
        row.update(face=signal, pHash63=fingerprint, semanticStatus='unassessed')
        if row['index']:
            left = rows[row['index'] - 1]
            _, before, prior_hash = cache[left['sha256']]
            cosine = None if before is None or vector is None else float(np.dot(before, vector))
            pairs.append({'leftIndex': left['index'], 'rightIndex': row['index'],
                          'exactImageMatch': left['sha256'] == digest,
                          'pHashHamming': (int(prior_hash, 16) ^ int(fingerprint, 16)).bit_count(),
                          'faceCosine': cosine, 'sourceContinuity': 'unassessed'})
    return {'cv2Version': cv2.__version__, 'uniqueImages': len(cache),
            'imagesWithFeatures': sum(v[1] is not None for v in cache.values()), 'adjacentPairs': pairs}


def prepare(source, output, model_root, expected_sha256, *, ffmpeg='ffmpeg', ffprobe='ffprobe', env=None, tick=lambda: None):
    """Produce reusable source facts only. Failed/truncated extraction publishes no manifest."""
    if output.exists():
        raise ValueError('Output already exists; choose a new directory')
    if source.is_symlink() or not source.is_file() or source.stat().st_size > 1024 ** 3:
        raise ValueError('Source must be a regular local video <=1 GiB')
    started = time.perf_counter()
    identity = file_hash(source)
    if identity != expected_sha256:
        raise ValueError('Source differs from the expected identity')
    models = pinned_models(model_root)
    metadata = probe(source, ffprobe, env=env)
    source_check_seconds = time.perf_counter() - started
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.framework-local-', dir=output.parent) as temp:
        work = Path(temp)
        frames = work / 'frames'
        frames.mkdir()
        log_path = work / 'decode.log'
        decode_start = time.perf_counter()
        with log_path.open('wb') as log:
            code = run_media(extraction_command(source, frames, ffmpeg), env or os.environ.copy(), tick,
                             900, stderr=log, poll_seconds=.1)
        if code or log_path.stat().st_size > MAX_LOG_BYTES:
            raise ValueError('Local media extraction failed; no manifest published')
        rows = sampled_frames(log_path.read_text(errors='replace'), frames, metadata['durationMs'])
        decode_seconds = time.perf_counter() - decode_start
        visual_start = time.perf_counter()
        signals = visual_signals(rows, work, model_root, tick)
        visual_seconds = time.perf_counter() - visual_start
        if file_hash(source) != identity:
            raise ValueError('Source changed during local analysis')
        frame_bytes = sum((work / row['path']).stat().st_size for row in rows)
        result = {'schema': SCHEMA, 'rawSha256': identity, 'source': metadata,
                  'timebase': 'raw-relative-ms-floor', 'coverage': 'sampled_not_exhaustive',
                  'settings': {'sceneThreshold': SCENE_THRESHOLD, 'stableGapSeconds': STABLE_GAP_SECONDS,
                               'longSide': 640, 'cpuThreads': CPU_THREADS, 'maxFrames': MAX_FRAMES},
                  'models': {'repository': 'opencv/opencv_zoo', 'revision': ZOO_REVISION, 'files': models},
                  'implementationSha256': file_hash(Path(__file__)), 'frames': rows, 'visual': signals,
                  'cutCandidatesMs': [r['atMs'] for r in rows if r['cutCandidate']],
                  'frameBytes': frame_bytes,
                  'timing': {'sourceCheckSeconds': source_check_seconds, 'decodeAndFrameSeconds': decode_seconds,
                             'visualSeconds': visual_seconds, 'totalSeconds': time.perf_counter() - started},
                  'newPaidModelCalls': 0, 'classificationStatus': 'not_run', 'workerIntegrated': False,
                  'limitations': ['Scene candidates and sparse frames do not prove continuous person footage.',
                                  'No detected face is uncertain, not a product insert or an absent person.',
                                  'Same-face/near-image similarity does not prove the same recording or content unit.',
                                  'An insert resets continuous duration even when the same person returns.',
                                  'Audio, review ownership and final framework labels remain unassessed.']}
        (work / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        output.mkdir()
        shutil.move(str(frames), str(output / 'frames'))
        shutil.move(str(work / 'manifest.json'), str(output / 'manifest.json'))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--model-root', type=Path, required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--ffprobe', default='ffprobe')
    args = parser.parse_args()
    try:
        result = prepare(args.source, args.output, args.model_root, args.expected_sha256,
                         ffmpeg=args.ffmpeg, ffprobe=args.ffprobe)
    except (ValueError, OSError, RuntimeError) as error:
        parser.exit(1, f'Local evidence failed ({type(error).__name__}); no completed manifest published.\n')
    print(json.dumps({'frames': len(result['frames']), 'cuts': len(result['cutCandidatesMs']),
                      'durationMs': result['source']['durationMs'], 'timing': result['timing'],
                      'frameBytes': result['frameBytes'], 'newPaidModelCalls': 0}))


if __name__ == '__main__':
    main()
