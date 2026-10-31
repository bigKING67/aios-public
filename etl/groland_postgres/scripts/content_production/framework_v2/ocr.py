"""On-screen text per shot for framework v2 (burned-in subtitles carry the voice-over in ~99% of shots).

RapidOCR with its default PP-OCRv6 small det/rec on the GPU through the torch engine (~16.7 frames/s and
0.22GB VRAM per instance on the RTX 5070 node). There is no CPU fallback: a node without CUDA is
unavailable rather than silently ~2.5x slower and CPU-bound. A small per-process pool of engines
(FRAMEWORK_V2_OCR_ENGINES, default 2) is shared by every job slot and lent one frame at a time. Four
concurrent jobs on the RTX 5070 node (2026-10-29, identical text): 1 engine 14.1 frames/s, 2 engines
17.2, 3 engines 15.3 — the card itself is the limit beyond two.
"""
from contextlib import contextmanager, nullcontext
import os
import queue
import threading

WIDTH = 720
MIN_SCORE = 0.6
MIN_FRAMES = 3
ENGINE = 'rapidocr-torch-cuda'
ENGINES_ENV = 'FRAMEWORK_V2_OCR_ENGINES'

_idle = queue.LifoQueue()
_created = 0
_create_lock = threading.Lock()


def measure(timings, name):
    return timings.measure(name) if timings is not None else nullcontext()


def engine_limit():
    value = int(os.getenv(ENGINES_ENV, '2'))
    if not 1 <= value <= 4:
        raise ValueError(f'{ENGINES_ENV} must be within 1..4')
    return value


def _build():
    import torch
    from rapidocr import EngineType, RapidOCR

    if not torch.cuda.is_available():
        raise RuntimeError('framework v2 OCR requires a CUDA GPU')
    return RapidOCR(params={'Global.log_level': 'error', 'EngineConfig.torch.use_cuda': True,
                            'Det.engine_type': EngineType.TORCH, 'Rec.engine_type': EngineType.TORCH,
                            'Cls.engine_type': EngineType.TORCH})


def _take(timings):
    global _created
    try:
        return _idle.get_nowait()
    except queue.Empty:
        pass
    with _create_lock:
        if _created < engine_limit():
            with measure(timings, 'framework_ocr_engine_init'):
                built = _build()
            _created += 1
            return built
    return _idle.get()


@contextmanager
def borrowed(timings=None):
    """An idle engine from the pool, created while fewer than the limit exist; waiting is lock wait."""
    with measure(timings, 'framework_ocr_lock_wait'):
        held = _take(timings)
    try:
        yield held
    finally:
        _idle.put(held)


def engine(*, timings=None):
    """Makes sure an engine can be built (CUDA present); callers probe availability with it."""
    with borrowed(timings) as held:
        return held


def sample_times(a, b):
    """One frame per second (at least three) per shot."""
    count = max(MIN_FRAMES, int(b - a))
    return [a + (b - a) * (k + 0.5) / count for k in range(count)]


def frame_requests(spans):
    return [(t, WIDTH) for a, b in spans for t in sample_times(a, b)]


def shot_text(frames, spans, tick=lambda: None, *, timings=None):
    """Unique lines per shot; frames holds frame_requests(spans)."""
    engine(timings=timings)
    out = []
    for a, b in spans:
        tick()
        lines = []
        for t in sample_times(a, b):
            frame = frames.get(t, WIDTH)
            if frame is None:
                continue
            with borrowed(timings) as ocr, measure(timings, 'framework_ocr_inference'):
                result = ocr(frame)
            for text, score in zip(result.txts or (), result.scores or ()):
                if score >= MIN_SCORE and text not in lines:
                    lines.append(text)
        out.append(lines)
    return out, ENGINE
