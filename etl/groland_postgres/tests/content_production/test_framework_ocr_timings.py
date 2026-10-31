import queue
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.framework_v2 import ocr
from content_production.stage_timings import StageTimings


@pytest.fixture
def pool(monkeypatch):
    """An empty engine pool whose engines come from `make()`; returns the list of built engines."""
    monkeypatch.setattr(ocr, '_idle', queue.LifoQueue())
    monkeypatch.setattr(ocr, '_created', 0)
    built = []

    def use(make):
        def build():
            built.append(make())
            return built[-1]
        monkeypatch.setattr(ocr, '_build', build)
        return built
    return use


def test_timings_preserve_frames_thresholds_dedup_and_engine_reuse(pool):
    calls = []

    def infer(frame):
        calls.append(frame)
        return SimpleNamespace(txts=['保留', '保留', '低置信'], scores=[.9, .8, .4])
    built = pool(lambda: infer)
    timings = StageTimings()
    frames = SimpleNamespace(get=lambda t, width: (t, width))
    assert ocr.shot_text(frames, [(0, 1)], timings=timings) == ([['保留']], ocr.ENGINE)
    assert calls == [(t, ocr.WIDTH) for t in ocr.sample_times(0, 1)]
    stages = timings.snapshot('test')['stages']
    assert stages['framework_ocr_lock_wait']['calls'] == 4
    assert stages['framework_ocr_inference']['calls'] == 3
    assert stages['framework_ocr_engine_init']['calls'] == 1
    assert len(built) == 1  # one job alone never needs a second engine


def test_the_pool_lends_at_most_the_limit_and_failures_return_the_engine(monkeypatch, pool):
    monkeypatch.setenv(ocr.ENGINES_ENV, '2')
    release, guard, inside, peak = threading.Event(), threading.Lock(), [], [0]

    def make():
        def infer(frame):
            with guard:
                inside.append(frame)
                peak[0] = max(peak[0], len(inside))
            release.wait(3)
            with guard:
                inside.remove(frame)
            raise ValueError('inference failed')
        return infer
    built = pool(make)
    frames = SimpleNamespace(get=lambda *args: object())
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(ocr.shot_text, frames, [(0, 1)]) for _ in range(3)]
        deadline = time.monotonic() + 3
        while len(inside) < 2 and time.monotonic() < deadline:
            time.sleep(0.01)
        time.sleep(0.1)
        assert len(inside) == 2  # the third job waits for an engine
        release.set()
        for future in futures:
            with pytest.raises(ValueError, match='inference failed'):
                future.result(timeout=3)
    assert (len(built), peak[0], ocr._idle.qsize()) == (2, 2, 2)


def test_the_engine_limit_is_bounded(monkeypatch):
    monkeypatch.setenv(ocr.ENGINES_ENV, '0')
    with pytest.raises(ValueError):
        ocr.engine_limit()
    monkeypatch.setenv(ocr.ENGINES_ENV, '3')
    assert ocr.engine_limit() == 3
