"""Private, budgeted render scratch space. Never owns the supplied root itself."""
from contextlib import contextmanager
import fcntl
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile
import time


class WorkspaceLimit(RuntimeError):
    pass


def positive_setting(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        raise ValueError(f"{name} must be a positive integer") from None
    if value < 1:
        raise ValueError(f"{name} must be a positive integer")
    return value


class RenderWorkspace:
    MARKER = b"aios-render-workspace-v1\n"

    def __init__(self, root: Path):
        self.root = root.resolve() / "aios-render-v1"
        self.max_bytes = positive_setting("CONTENT_PRODUCTION_WORK_MAX_BYTES", 8 * 1024 ** 3)
        self.min_free_bytes = positive_setting("CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES", 2 * 1024 ** 3)
        self.lock_fd = None
        self.last_check = None
        self.peak_bytes = 0
        self.recovered = 0

    def __enter__(self):
        if self.root.is_symlink():
            raise RuntimeError("render workspace cannot be a symlink")
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.root.stat()
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise RuntimeError("render workspace must be private and owned by the worker")
        self.lock_fd = os.open(self.root / ".worker.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for entry in self.root.iterdir():
                marker = entry / ".owner"
                if (re.fullmatch(r"job-[a-z0-9_]{8}", entry.name) and not entry.is_symlink()
                        and entry.is_dir() and not marker.is_symlink() and marker.is_file()
                        and marker.stat().st_size == len(self.MARKER)
                        and marker.read_bytes() == self.MARKER):
                    shutil.rmtree(entry)
                    self.recovered += 1
            self.check(force=True)
            return self
        except BaseException:
            os.close(self.lock_fd)
            self.lock_fd = None
            raise

    def __exit__(self, *_args):
        # Closing (not LOCK_UN) keeps the lock while an inherited child still owns it.
        os.close(self.lock_fd)
        self.lock_fd = None

    @contextmanager
    def job(self):
        with tempfile.TemporaryDirectory(prefix="job-", dir=self.root) as directory:
            work = Path(directory)
            (work / ".owner").write_bytes(self.MARKER)
            yield work

    def check(self, *, force: bool = False):
        now = time.monotonic()
        if not force and self.last_check is not None and now - self.last_check < 2:
            return
        self.last_check = now
        if shutil.disk_usage(self.root).free < self.min_free_bytes:
            raise WorkspaceLimit("临时磁盘剩余空间不足，制作已停止")
        size, pending = 0, [self.root]
        while pending:
            try:
                entries = os.scandir(pending.pop())
            except FileNotFoundError:
                continue
            with entries:
                for entry in entries:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            pending.append(entry.path)
                        else:
                            size += entry.stat(follow_symlinks=False).st_size
                    except FileNotFoundError:
                        continue  # Renderer removed its own transient file during sampling.
                    self.peak_bytes = max(self.peak_bytes, size)
                    if size > self.max_bytes:
                        raise WorkspaceLimit("临时文件超过磁盘预算，制作已停止")

    def receipt(self) -> dict:
        return {"scope": "sampled_logical_bytes", "maxBytes": self.max_bytes,
                "minFreeBytes": self.min_free_bytes, "peakObservedBytes": self.peak_bytes,
                "recoveredWorkspaces": self.recovered}
