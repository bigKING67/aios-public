"""Shared macOS FFmpeg budget; Linux production execution stays unchanged."""
from contextlib import contextmanager
from pathlib import Path
import sys
import time


def limited_command(command):
    """Bound decoding, filtering and encoding for our single-output commands."""
    result = [command[0], '-filter_threads', '1', '-filter_complex_threads', '1']
    for arg in command[1:-1]:
        if arg == '-i':
            result.extend(['-threads', '2'])
        result.append(arg)
    return [*result, '-threads', '2', command[-1]]


@contextmanager
def media_slot(command, tick, timeout):
    """Two slots shared by threads/processes for this user, with bounded waiting.

    Keep lock files: unlinking one while another process waits would split the
    lock domain. File locks release on close/process exit; no stale PID recovery.
    Waiting has its own timeout and continues the caller's lease/cancel callback.
    """
    if sys.platform != 'darwin' or Path(command[0]).name not in ('ffmpeg', 'ffmpeg-full'):
        yield command
        return
    import fcntl

    root = Path.home() / 'Library/Caches/aios/media-budget-v1'
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    deadline = time.monotonic() + timeout
    held = None
    try:
        while held is None:
            tick()
            if time.monotonic() >= deadline:
                raise TimeoutError('media slot wait timed out')
            for index in range(2):
                candidate = (root / f'{index}.lock').open('a+b')
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
                time.sleep(min(.1, max(0, deadline - time.monotonic())))
        yield limited_command(command)
    finally:
        if held is not None:
            held.close()
