"""Pre-analysis de-duplication: audio and visual fingerprints, compared before any paid call.

Relations (v2 design §5.1): a full repost reuses the existing card; a shared opening is analysed
but grouped into the same family; anything else is new. Thresholds are calibrated on the 50 sample
films and recorded with each decision.
"""
import subprocess
from collections import Counter

import numpy as np

AUDIO_RATE = 8000
AUDIO_WINDOW = 2048        # 0.256 s
AUDIO_HOP = 512            # 0.064 s per sub-fingerprint
AUDIO_FRAME_SEC = AUDIO_HOP / AUDIO_RATE
AUDIO_BANDS = 33           # 32 energy differences -> 32 bits
AUDIO_BIT_TOLERANCE = 10   # of 32 bits, best of offset ±1 frame: same audio 97%, unrelated 3% (calibrated 2026-10-20)
VISUAL_FPS = 2
VISUAL_BIT_TOLERANCE = 14  # of 64 bits: same footage after crop/watermark 99%, unrelated 0%
REPOST_COVERAGE = 0.9
OPENING_SEC = 8.0
OPENING_COVERAGE = 0.8


def audio_fingerprint(path, ffmpeg='ffmpeg'):
    """32-bit sub-fingerprint every 64 ms from band-energy differences (300-3000 Hz, log-spaced).

    Robust to re-encoding, volume and small EQ changes; only ffmpeg is needed to decode.
    Empty when there is no audio track."""
    out = subprocess.run([ffmpeg, '-nostdin', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-ac', '1',
                          '-ar', str(AUDIO_RATE), '-f', 's16le', '-'], capture_output=True)
    samples = np.frombuffer(out.stdout, dtype='<i2').astype(np.float32) if not out.returncode else np.zeros(0)
    if len(samples) < AUDIO_WINDOW * 2:
        return np.zeros(0, dtype=np.uint32)
    count = 1 + (len(samples) - AUDIO_WINDOW) // AUDIO_HOP
    frames = np.lib.stride_tricks.as_strided(samples, (count, AUDIO_WINDOW), (samples.strides[0] * AUDIO_HOP, samples.strides[0]))
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(AUDIO_WINDOW), axis=1)) ** 2
    freqs = np.fft.rfftfreq(AUDIO_WINDOW, 1 / AUDIO_RATE)
    edges = np.geomspace(300, 3000, AUDIO_BANDS + 1)
    energy = np.stack([spectrum[:, (freqs >= lo) & (freqs < hi)].sum(axis=1) for lo, hi in zip(edges[:-1], edges[1:])], axis=1)
    band_diff = energy[:, :-1] - energy[:, 1:]
    bits = (band_diff[1:] - band_diff[:-1]) > 0
    return np.packbits(bits, axis=1).view('>u4').ravel().astype(np.uint32)


def visual_fingerprint(path, ffmpeg='ffmpeg'):
    """64-bit difference hash per frame at VISUAL_FPS (9x8 grey, horizontal gradient)."""
    out = subprocess.run([ffmpeg, '-nostdin', '-v', 'error', '-i', str(path), '-vf',
                          f'fps={VISUAL_FPS},scale=9:8:flags=area,format=gray', '-f', 'rawvideo', '-'],
                         capture_output=True, check=True)
    frames = np.frombuffer(out.stdout, dtype=np.uint8).reshape(-1, 8, 9).astype(np.int16)
    bits = (frames[:, :, 1:] > frames[:, :, :-1]).reshape(len(frames), 64)
    return np.packbits(bits, axis=1).view('>u8').ravel()


def _popcount(values):
    values = values.astype(np.uint64)
    count = np.zeros(values.shape, dtype=np.uint64)
    while values.any():
        count += values & np.uint64(1)
        values >>= np.uint64(1)
    return count


def coverage(a, b, tolerance, max_offset=None):
    """Share of `a` frames matching `b` at the best single time offset (offset found by exact-hash votes).

    Returns (coverage_of_a, offset_frames). Different edits of the same footage keep one offset per
    shared stretch; the best offset is enough to tell reposts and shared openings apart."""
    if len(a) == 0 or len(b) == 0:
        return 0.0, None
    shift = 16 if a.dtype == np.uint32 else 40  # vote on the high bits; verify on all bits below
    index = {}
    for j, value in enumerate((b >> shift).tolist()):
        index.setdefault(value, []).append(j)
    votes = Counter(j - i for i, value in enumerate((a >> shift).tolist()) for j in index.get(value, ())
                    if max_offset is None or abs(j - i) <= max_offset)
    best = None, 0.0
    for offset, _ in votes.most_common(5) or [(0, 0)]:
        # A trim that is not a whole frame splits the difference between neighbouring offsets.
        diffs = []
        for o in (offset - 1, offset, offset + 1):
            lo, hi = max(0, -o, -offset + 1), min(len(a), len(b) - o, len(b) - offset - 1)
            if hi > lo:
                diffs.append((lo, _popcount(a[lo:hi] ^ b[lo + o:hi + o])))
        if not diffs:
            continue
        lo = max(d[0] for d in diffs)
        size = min(len(d[1]) - (lo - d[0]) for d in diffs)
        diff = np.min(np.stack([d[1][lo - d[0]:lo - d[0] + size] for d in diffs]), axis=0)
        share = float((diff <= tolerance).sum()) / len(a)
        if share > best[1]:
            best = offset, share
    return best[1], best[0]


def relation(fa, fb):
    """fa/fb: dicts with audio, visual arrays and duration. Returns (kind, evidence)."""
    audio_full = min(coverage(fa['audio'], fb['audio'], AUDIO_BIT_TOLERANCE)[0],
                     coverage(fb['audio'], fa['audio'], AUDIO_BIT_TOLERANCE)[0])
    visual_full = min(coverage(fa['visual'], fb['visual'], VISUAL_BIT_TOLERANCE)[0],
                      coverage(fb['visual'], fa['visual'], VISUAL_BIT_TOLERANCE)[0])
    n_audio = int(OPENING_SEC / AUDIO_FRAME_SEC)
    n_visual = int(OPENING_SEC * VISUAL_FPS)
    opening_audio = coverage(fa['audio'][:n_audio], fb['audio'][:n_audio * 2], AUDIO_BIT_TOLERANCE)[0]
    opening_visual = coverage(fa['visual'][:n_visual], fb['visual'][:n_visual * 2], VISUAL_BIT_TOLERANCE)[0]
    evidence = {'audio_full': round(audio_full, 3), 'visual_full': round(visual_full, 3),
                'opening_audio': round(opening_audio, 3), 'opening_visual': round(opening_visual, 3),
                'duration_gap_sec': round(abs(fa['duration'] - fb['duration']), 1)}
    has_audio = len(fa['audio']) and len(fb['audio'])
    if visual_full >= REPOST_COVERAGE and (audio_full >= REPOST_COVERAGE or not has_audio):
        return 'repost', evidence
    if opening_audio >= OPENING_COVERAGE or opening_visual >= OPENING_COVERAGE:
        return 'shared_opening', evidence
    return 'distinct', evidence
