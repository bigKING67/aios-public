#!/usr/bin/env python3
"""Canonical Cargo cache lifecycle; no external Python packages (macOS/Linux)."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[2]
TARGET = Path('.cache/cargo-target/backend-rust')
STATE = Path('.cache/cargo-maintenance')
POLICY = json.loads((ROOT / 'scripts/config/backend-cargo-cache.json').read_text())


def log(message):
    print(f'[cargo-cache] {message}', file=sys.stderr, flush=True)


def safe_path(root, relative):
    """Never follow a symlink, including any existing ancestor."""
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise RuntimeError(f'symlink is not a maintenance target: {relative}')
    return current


def disk_bytes(path):
    if not path.exists():
        return 0
    result = subprocess.run(['du', '-sk', str(path)], check=True,
                            capture_output=True, text=True, timeout=60)
    return int(result.stdout.split()[0]) * 1024


def audit(root):
    target = safe_path(root, TARGET)
    incremental = safe_path(root, TARGET / 'debug/incremental')
    total = disk_bytes(target)
    inc = disk_bytes(incremental)
    return {'totalBytes': total, 'incrementalBytes': inc,
            'otherBytes': max(0, total - inc), **POLICY}


def reasons(report, last_used, now):
    result = []
    if report['totalBytes'] > POLICY['totalBudgetBytes']:
        result.append('total-budget')
    if report['incrementalBytes'] > POLICY['incrementalBudgetBytes']:
        result.append('incremental-budget')
    if last_used and now - last_used >= POLICY['idleDays'] * 86400:
        result.append('idle')
    return result


def assert_unused(target):
    if not target.exists():
        return
    # lsof includes directly launched binaries and tools bypassing the wrapper.
    result = subprocess.run(['lsof', '-nP', '-t', '+D', str(target)],
                            capture_output=True, text=True, timeout=60)
    if result.stdout.strip():
        raise RuntimeError('target is in use; cleanup skipped')
    if result.returncode not in (0, 1) or result.stderr.strip():
        raise RuntimeError('cannot prove target is unused; cleanup skipped')


def validate_cleanup(root, relative):
    target = safe_path(root, relative)
    if target.exists() and not target.is_dir():
        raise RuntimeError('cleanup target must be a directory')
    tracked = subprocess.run(['git', 'ls-files', '-z', '--', str(relative)],
                             cwd=root, check=True, capture_output=True, timeout=30)
    if tracked.stdout:
        raise RuntimeError('tracked files inside cleanup target; cleanup refused')
    # Reject links inside the tree too, rather than relying on rmtree semantics.
    def fail_walk(error):
        raise error

    for directory, dirs, files in os.walk(target, followlinks=False, onerror=fail_walk):
        for name in dirs + files:
            if (Path(directory) / name).is_symlink():
                raise RuntimeError('symlink inside cleanup target; cleanup refused')
    assert_unused(root / TARGET)
    return target


def cleanup(root, full=False):
    relative = TARGET if full else TARGET / 'debug/incremental'
    target = validate_cleanup(root, relative)
    selected = disk_bytes(target)
    before = disk_bytes(root / TARGET)
    if target.exists():
        shutil.rmtree(target)
    released = max(0, before - disk_bytes(root / TARGET))
    log(f'removed={relative} selectedBytes={selected} releasedBytes={released}')
    return released


def lock_file(root):
    directory = safe_path(root, STATE)
    directory.mkdir(parents=True, exist_ok=True)
    lock = safe_path(root, STATE / 'lock')
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    return fd


def try_exclusive(fd):
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except BlockingIOError:
        return False


def timestamp(root, name):
    marker = safe_path(root, STATE / name)
    return marker.stat().st_mtime if marker.exists() else 0


def mark(root, name):
    marker = safe_path(root, STATE / name)
    fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        os.utime(fd, None)
    finally:
        os.close(fd)


def auto_maintain(root):
    now = time.time()
    checked = timestamp(root, 'last-check')
    attempted = timestamp(root, 'last-attempt')
    failed = attempted > checked
    if failed and now - attempted < POLICY['retryIntervalMinutes'] * 60:
        return
    pending = timestamp(root, 'incremental-over-budget') > checked
    if not failed and not pending and now - checked < POLICY['checkIntervalHours'] * 3600:
        return
    # Only completed maintenance advances the daily check. Failures back off
    # independently, including a retry of a post-build over-budget observation.
    mark(root, 'last-attempt')
    report = audit(root)
    triggers = reasons(report, timestamp(root, 'last-use'), now)
    if triggers:
        log(f'triggers={",".join(triggers)} totalBytes={report["totalBytes"]} '
            f'incrementalBytes={report["incrementalBytes"]}')
        if report['incrementalBytes']:
            cleanup(root)
        remaining = disk_bytes(root / TARGET)
        if remaining > POLICY['totalBudgetBytes']:
            log(f'remainingBytes={remaining}; inspect with npm run maintenance:cargo; '
                'full cleanup requires --all --apply')
    mark(root, 'last-check')


def post_build_check(root, fd):
    # The last concurrent builder can inspect; never wait for or clean another
    # builder's outputs. Detection does not discard this build's fresh cache.
    if not try_exclusive(fd):
        return
    report = audit(root)
    triggers = reasons(report, 0, time.time())
    if 'incremental-budget' in triggers:
        mark(root, 'incremental-over-budget')
    if triggers:
        log(f'post-build triggers={",".join(triggers)} '
            f'totalBytes={report["totalBytes"]} incrementalBytes={report["incrementalBytes"]}; '
            'incremental overage is checked at next safe build; '
            'full cleanup requires --all --apply')


def wait_for_cargo(args, fd):
    # Cargo inherits the shared lock even if this supervisor is killed. Use a
    # separate process group so a signal to the wrapper also reaches test tools.
    child = subprocess.Popen(['cargo', *args], pass_fds=(fd,), start_new_session=True)

    def forward(signum, _frame):
        try:
            os.killpg(child.pid, signum)
        except ProcessLookupError:
            pass

    handlers = {sig: signal.signal(sig, forward)
                for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)}
    try:
        returncode = child.wait()
    finally:
        for sig, handler in handlers.items():
            signal.signal(sig, handler)
    if returncode >= 0:
        try:
            post_build_check(ROOT, fd)
        except (OSError, RuntimeError, subprocess.SubprocessError, ValueError) as error:
            log(f'post-build check skipped: {error}')
    os.close(fd)
    if returncode < 0:
        signum = -returncode
        signal.signal(signum, signal.SIG_DFL)
        os.kill(os.getpid(), signum)
    raise SystemExit(returncode)


def canonical_invocation(args):
    args = args[:args.index('--')] if '--' in args else args
    configured = os.environ.get('CARGO_TARGET_DIR', str(ROOT / TARGET))
    for index, arg in enumerate(args):
        if arg == '--target-dir' and index + 1 < len(args):
            configured = args[index + 1]
        elif arg.startswith('--target-dir='):
            configured = arg.split('=', 1)[1]
    # Arbitrary --config may redirect back to canonical even with a custom env
    # target. Conservatively lock canonical, but never automatically clean it.
    return (any(arg == '--config' or arg.startswith('--config=') for arg in args)
            or Path(configured).resolve() == ROOT / TARGET)


def run_cargo(args):
    if args and args[0] in ('fmt', '--version', '-V', '--help', '-h', 'help'):
        os.execvp('cargo', ['cargo', *args])
    if not canonical_invocation(args):
        log('target/config override: automatic maintenance disabled')
        os.execvp('cargo', ['cargo', *args])
    safe_path(ROOT, TARGET)
    fd = lock_file(ROOT)
    command_args = args[:args.index('--')] if '--' in args else args
    overridden = any(arg == '--config' or arg.startswith('--config=')
                     or arg == '--target-dir' or arg.startswith('--target-dir=')
                     for arg in command_args)
    if 'clean' in command_args:
        if not try_exclusive(fd):
            raise RuntimeError('active build holds cache lock; clean refused')
        validate_cleanup(ROOT, TARGET)
    else:
        # Exclusive check is opportunistic; ordinary builds share the lock.
        if try_exclusive(fd):
            try:
                if not overridden:
                    auto_maintain(ROOT)
            except (OSError, RuntimeError, subprocess.SubprocessError, ValueError) as error:
                log(f'maintenance skipped: {error}')
        fcntl.flock(fd, fcntl.LOCK_SH)
    mark(ROOT, 'last-use')
    if not overridden and args and args[0] in ('build', 'b', 'check', 'c', 'test', 't', 'clippy'):
        wait_for_cargo(args, fd)
    # Other commands (including long-lived cargo run) retain exec semantics.
    # The lock file is never unlinked, avoiding inode replacement races.
    os.set_inheritable(fd, True)
    os.execvp('cargo', ['cargo', *args])


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'run':
        run_cargo(sys.argv[2:])
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='remove incremental cache')
    parser.add_argument('--all', action='store_true', help='select the full canonical target')
    args = parser.parse_args()
    if not args.apply:
        print(json.dumps({'mode': 'dry-run', 'target': str(TARGET if args.all else TARGET / 'debug/incremental'),
                          **audit(ROOT)}, indent=2))
        return
    fd = lock_file(ROOT)
    try:
        if not try_exclusive(fd):
            raise RuntimeError('active build holds cache lock; cleanup refused')
        cleanup(ROOT, args.all)
        mark(ROOT, 'last-check')
        print(json.dumps(audit(ROOT), indent=2))
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.SubprocessError, ValueError) as error:
        log(str(error))
        sys.exit(1)
