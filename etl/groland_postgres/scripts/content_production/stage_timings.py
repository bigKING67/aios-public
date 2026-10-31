"""Monotonic, per-job timings shared by concurrent branches; never sum overlapping stages."""
from contextlib import contextmanager
import threading
import time


class StageTimings:
    def __init__(self):
        self._started = time.perf_counter()
        self._lock = threading.Lock()
        self._stages = {}

    @contextmanager
    def measure(self, name):
        started, failed = time.perf_counter(), True
        try:
            yield
            failed = False
        finally:
            elapsed = time.perf_counter() - started
            with self._lock:
                row = self._stages.setdefault(name, {'seconds': 0.0, 'calls': 0, 'failures': 0})
                row['seconds'] += elapsed
                row['calls'] += 1
                row['failures'] += int(failed)

    def call(self, name, function, *args, **kwargs):
        with self.measure(name):
            return function(*args, **kwargs)

    def snapshot(self, boundary):
        """Completed stages only. The DB snapshot precedes its own write; logs include write/cleanup."""
        with self._lock:
            stages = {name: {**row, 'seconds': round(row['seconds'], 4)}
                      for name, row in self._stages.items()}
        return {'version': 1, 'boundary': boundary, 'elapsedSeconds': round(time.perf_counter() - self._started, 4),
                'stages': stages}
