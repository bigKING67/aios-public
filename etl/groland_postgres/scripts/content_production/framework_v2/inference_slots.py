"""Per-user, per-endpoint VLM admission shared by worker threads and processes.

All workers targeting one endpoint must use the same limit. Change it only after
draining those workers. Lock files stay in place; unlinking them splits the lock
domain. A crashed process releases its slots automatically.
"""
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import tempfile
import time

LIMIT_ENV = 'FRAMEWORK_V2_VLM_MAX_INFLIGHT'
WAIT_SECONDS = 180


def limit():
    value = int(os.getenv(LIMIT_ENV, '12'))
    if not 1 <= value <= 64:
        raise ValueError(f'{LIMIT_ENV} must be within 1..64')
    return value


@contextmanager
def acquire(endpoint, check=lambda: None, *, root=None):
    import fcntl

    capacity = limit()
    key = hashlib.sha256(endpoint.rstrip('/').encode()).hexdigest()[:24]
    base = Path(root) if root is not None else Path(tempfile.gettempdir()) / f'aios-vlm-{os.getuid()}'
    directory = base / key
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    deadline = time.monotonic() + WAIT_SECONDS
    held = None
    try:
        while held is None:
            check()
            if time.monotonic() >= deadline:
                raise TimeoutError('local VLM admission timed out')
            for index in range(capacity):
                candidate = (directory / str(index)).open('a+b')
                try:
                    fcntl.flock(candidate, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    candidate.close()
                except BaseException:
                    candidate.close()
                    raise
                else:
                    held = candidate
                    break
            if held is None:
                time.sleep(.02)
        check()
        yield
    finally:
        if held is not None:
            held.close()
