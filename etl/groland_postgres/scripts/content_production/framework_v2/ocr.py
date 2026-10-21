"""On-screen text per shot for framework v2 (burned-in subtitles carry the voice-over in ~99% of shots).

RapidOCR with its default PP-OCRv6 small det/rec on the GPU through the torch engine (~16.7 frames/s and
0.22GB VRAM per instance on the RTX 5070 node). There is no CPU fallback: a node without CUDA is
unavailable rather than silently ~2.5x slower and CPU-bound. One engine per process is shared by every
job slot behind a lock, so concurrent jobs do not each add an instance to a nearly full 12GB card.
"""
import threading

WIDTH = 720
MIN_SCORE = 0.6
MIN_FRAMES = 3
ENGINE = 'rapidocr-torch-cuda'


_engine = None
_lock = threading.Lock()


def engine():
    """The process-wide engine; calls must hold _lock."""
    global _engine
    with _lock:
        if _engine is None:
            import torch
            from rapidocr import EngineType, RapidOCR

            if not torch.cuda.is_available():
                raise RuntimeError('framework v2 OCR requires a CUDA GPU')
            _engine = RapidOCR(params={'Global.log_level': 'error', 'EngineConfig.torch.use_cuda': True,
                                       'Det.engine_type': EngineType.TORCH, 'Rec.engine_type': EngineType.TORCH,
                                       'Cls.engine_type': EngineType.TORCH})
        return _engine


def sample_times(a, b):
    """One frame per second (at least three) per shot."""
    count = max(MIN_FRAMES, int(b - a))
    return [a + (b - a) * (k + 0.5) / count for k in range(count)]


def frame_requests(spans):
    return [(t, WIDTH) for a, b in spans for t in sample_times(a, b)]


def shot_text(frames, spans, tick=lambda: None):
    """Unique lines per shot; frames holds frame_requests(spans)."""
    ocr = engine()
    out = []
    for a, b in spans:
        tick()
        lines = []
        for t in sample_times(a, b):
            frame = frames.get(t, WIDTH)
            if frame is None:
                continue
            with _lock:
                result = ocr(frame)
            for text, score in zip(result.txts or (), result.scores or ()):
                if score >= MIN_SCORE and text not in lines:
                    lines.append(text)
        out.append(lines)
    return out, ENGINE
