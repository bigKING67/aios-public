"""Per-shot appearance features and temporal person chains for framework v2.

Features per shot (three sampled frames of the original, 540px wide): the largest confident face's
SFace embedding (YuNet detector), an HSV histogram of the torso below it, and a background histogram.
Chains link only temporally adjacent face shots; anonymous chain ids are never compared across
films or treated as identities.

Face models: OpenCV Zoo YuNet 2023mar / SFace 2021dec (MIT / Apache-2.0), pinned by SHA-256 and
loaded from FRAMEWORK_V2_FACE_MODEL_DIR. Parameters frozen 2026-10-18 (research/p0a-results.md).
"""
import hashlib
import os
from pathlib import Path

import cv2
import numpy as np

SAMPLE_POSITIONS = (0.2, 0.5, 0.8)
MIN_FACE_SCORE = 0.85
MIN_FACE_FRAC = 0.08
WORK_WIDTH = 540
HIST_BINS = (12, 6, 4)

MAX_GAP_SEC = 6.0
STRONG_FACE = 0.55
WEAK_FACE = 0.36
TORSO_MATCH = 0.55
REJOIN_FACE = 0.40
REJOIN_APPEARANCE = 0.40
REJOIN_SURE = 0.60
GRAY_ZONE = (0.30, 0.60)

# opencv_zoo commit 47534e27c9851bb1128ccc0102f1145e27f23f98 (Git LFS objects).
FACE_MODELS = {
    'face_detection_yunet_2023mar.onnx': '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    'face_recognition_sface_2021dec.onnx': '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
}
MODEL_DIR_ENV = 'FRAMEWORK_V2_FACE_MODEL_DIR'


def _models():
    root = Path(os.environ.get(MODEL_DIR_ENV, ''))
    paths = {name: root / name for name in FACE_MODELS}
    missing = [n for n, p in paths.items() if not p.is_file()]
    if missing:
        raise RuntimeError(f'{MODEL_DIR_ENV} lacks {", ".join(missing)}')
    for name, path in paths.items():
        if hashlib.sha256(path.read_bytes()).hexdigest() != FACE_MODELS[name]:
            raise RuntimeError(f'{name} does not match the pinned SHA-256')
    det = cv2.FaceDetectorYN.create(str(paths['face_detection_yunet_2023mar.onnx']), '', (320, 320), MIN_FACE_SCORE)
    rec = cv2.FaceRecognizerSF.create(str(paths['face_recognition_sface_2021dec.onnx']), '')
    return det, rec, dict(FACE_MODELS)


def _hist(img, mask=None):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1, 2], mask, list(HIST_BINS), [0, 180, 0, 256, 0, 256]).flatten()
    total = h.sum()
    return h / total if total > 0 else h


def _bg_mask(shape, person):
    h, w = shape[:2]
    mask = np.zeros((h, w), np.uint8)
    band = int(0.18 * w)
    mask[: int(0.25 * h), :] = 255
    mask[:, :band] = 255
    mask[:, w - band:] = 255
    if person is not None:
        x0, y0, x1, y1 = person
        mask[y0:y1, x0:x1] = 0
    return mask


def sample_times(a, b):
    return [a + (b - a) * pos for pos in SAMPLE_POSITIONS]


def frame_requests(spans):
    return [(t, WORK_WIDTH) for a, b in spans for t in sample_times(a, b)]


def extract(frames, spans, tick=lambda: None):
    """spans: [(start, end)] seconds; frames: a frames.Frames holding frame_requests(spans).
    Returns arrays keyed like the research npz plus model digests."""
    det, rec, digests = _models()
    dim = int(np.prod(HIST_BINS))
    n = len(spans)
    out = {'start': np.array([a for a, _ in spans], np.float32), 'end': np.array([b for _, b in spans], np.float32),
           'face': np.zeros((n, 128), np.float32), 'torso': np.zeros((n, dim), np.float32),
           'bg': np.zeros((n, dim), np.float32), 'has_face': np.zeros(n, bool), 'has_torso': np.zeros(n, bool)}
    for i, (a, b) in enumerate(spans):
        tick()
        faces, torsos, bgs = [], [], []
        for t in sample_times(a, b):
            frame = frames.get(t, WORK_WIDTH)
            if frame is None:
                continue
            h, w = frame.shape[:2]
            det.setInputSize((w, h))
            _, found = det.detect(frame)
            face = max(found, key=lambda f: f[2] * f[3]) if found is not None else None
            if face is not None and face[2] / w < MIN_FACE_FRAC:
                face = None
            torso = person = None
            if face is not None:
                x, y, fw, fh = (int(v) for v in face[:4])
                tx0, tx1 = max(0, x - fw // 2), min(w, x + fw + fw // 2)
                ty0, ty1 = min(h, y + int(1.2 * fh)), min(h, y + int(3.2 * fh))
                torso = (tx0, ty0, tx1, ty1) if ty1 - ty0 > 10 and tx1 - tx0 > 10 else None
                person = (max(0, x - fw), max(0, y - fh // 2), min(w, x + 2 * fw), h)
                faces.append(rec.feature(rec.alignCrop(frame, face)).flatten())
                if torso is not None:
                    x0, y0, x1, y1 = torso
                    torsos.append(_hist(frame[y0:y1, x0:x1]))
            bgs.append(_hist(frame, _bg_mask(frame.shape, person)))
        if bgs:
            out['bg'][i] = np.mean(bgs, axis=0)
        if faces:
            v = np.mean(faces, axis=0)
            out['face'][i] = v / np.linalg.norm(v)
            out['has_face'][i] = True
        if torsos:
            out['torso'][i] = np.mean(torsos, axis=0)
            out['has_torso'][i] = True
    out['modelSha256'] = digests
    return out


def _hist_sim(a, b):
    return float(np.minimum(a, b).sum())


def chains(f):
    """{shot index: chain id} for face shots."""
    face_idx = [int(i) for i in np.flatnonzero(f['has_face'])]
    parent = {i: i for i in face_idx}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def torso(i, j):
        return _hist_sim(f['torso'][i], f['torso'][j]) if f['has_torso'][i] and f['has_torso'][j] else 0.0

    for i, j in zip(face_idx, face_idx[1:]):
        if f['start'][j] - f['end'][i] > MAX_GAP_SEC:
            continue
        sim = float(f['face'][i] @ f['face'][j])
        if sim >= STRONG_FACE or (sim >= WEAK_FACE and torso(i, j) >= TORSO_MATCH):
            parent[find(j)] = find(i)
    # Re-join neighbouring chains on the average pairwise face similarity (the cosine of mean vectors
    # drifts towards a generic face) when clothing or background also agree.
    changed = True
    while changed:
        changed = False
        for i, j in zip(face_idx, face_idx[1:]):
            ci, cj = find(i), find(j)
            if ci == cj or f['start'][j] - f['end'][i] > MAX_GAP_SEC:
                continue
            fi = np.stack([f['face'][k] for k in face_idx if find(k) == ci])
            fj = np.stack([f['face'][k] for k in face_idx if find(k) == cj])
            sim = float((fi @ fj.T).mean())
            appearance = max(torso(i, j), _hist_sim(f['bg'][i], f['bg'][j]))
            if sim >= REJOIN_SURE or (sim >= REJOIN_FACE and appearance >= REJOIN_APPEARANCE):
                parent[cj] = ci
                changed = True
    return {i: find(i) for i in face_idx}


def gray_pairs(f, label):
    """Adjacent face shots on different chains with a face similarity in the gray zone."""
    face_idx = [int(i) for i in np.flatnonzero(f['has_face'])]
    out = []
    for i, j in zip(face_idx, face_idx[1:]):
        if f['start'][j] - f['end'][i] > MAX_GAP_SEC or label[i] == label[j]:
            continue
        sim = float(f['face'][i] @ f['face'][j])
        if GRAY_ZONE[0] <= sim < GRAY_ZONE[1]:
            out.append((i, j, round(sim, 3)))
    return out


def merge(label, i, j):
    old, new = label[j], label[i]
    return {k: (new if v == old else v) for k, v in label.items()}
