import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import stage_timings


def test_parallel_stages_keep_elapsed_separate_and_snapshots_immutable(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(stage_timings.time, 'perf_counter', lambda: clock[0])
    timings = stage_timings.StageTimings()
    started, release = threading.Barrier(3, timeout=5), threading.Event()

    def call():
        with timings.measure('parallel_cloud'):
            started.wait()
            assert release.wait(5)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(call) for _ in range(2)]
        started.wait()
        clock[0] = 5.0
        release.set()
        for future in futures:
            future.result()
    snapshot = timings.snapshot('before_result_write')
    assert snapshot['elapsedSeconds'] == 5
    assert snapshot['stages']['parallel_cloud'] == {'seconds': 10.0, 'calls': 2, 'failures': 0}
    snapshot['stages']['parallel_cloud']['calls'] = 999
    assert timings.snapshot('after_cleanup')['stages']['parallel_cloud']['calls'] == 2


def test_exception_duration_is_recorded_without_suppressing_or_serializing_error(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(stage_timings.time, 'perf_counter', lambda: clock[0])
    timings = stage_timings.StageTimings()
    error = RuntimeError('private request contents')

    def fail():
        clock[0] = 3.0
        raise error

    with pytest.raises(RuntimeError) as raised:
        timings.call('download', fail)
    assert raised.value is error
    snapshot = timings.snapshot('before_result_write')
    assert snapshot['stages']['download'] == {'seconds': 3.0, 'calls': 1, 'failures': 1}
    assert 'private request' not in str(snapshot)
