"""Bounded FFmpeg QC; timestamps are not lip-sync or listening evidence."""
from dataclasses import asdict, dataclass
import json
import math
import os
from pathlib import Path
import re
import statistics
import subprocess
import time

from .execution import renderer_env
from .remix_normalization import _number


@dataclass(frozen=True)
class Settings:
    freeze_seconds: float = 0.2
    freeze_noise_db: float = -50.0
    av_offset_seconds: float = 0.1
    pts_gap_seconds: float = 0.05
    picture_max_distance: float = 0.10
    picture_min_texture: float = 0.04
    timeout_seconds: float = 180.0

    @classmethod
    def from_env(cls):
        bounds = {"freeze_seconds": (0.1, 2), "freeze_noise_db": (-80, -30),
                  "av_offset_seconds": (0.01, 1), "pts_gap_seconds": (0.034, 0.2),
                  "timeout_seconds": (10, 900), "picture_max_distance": (0.001, 0.3), "picture_min_texture": (0.001, 0.2)}
        return cls(**{key: _number("CONTENT_PRODUCTION_REMIX_QC_" + key.upper(), default, *bounds[key])
                      for key, default in asdict(cls()).items()})


def command(args, target, work, tick, deadline, lock_fd=None):
    """No child credentials, bounded output, heartbeat and cancellation throughout."""
    tick()
    with target.open("wb") as out:
        proc = subprocess.Popen(args, stdout=out, stderr=subprocess.DEVNULL, env=renderer_env(work),
                                pass_fds=() if lock_fd is None else (lock_fd,))
        try:
            while proc.poll() is None:
                tick()
                if time.monotonic() > deadline or target.stat().st_size > 16 * 1024 ** 2:
                    raise TimeoutError("QC resource limit")
                time.sleep(0.1)
            tick()
            if proc.returncode or target.stat().st_size > 16 * 1024 ** 2:
                raise ValueError("QC media inspection incomplete")
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=3)
    return target.read_text()


def number(value):
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("nonfinite timestamp")
    return result


def timing(video, frames, settings, work, tick, deadline, lock_fd=None):
    probe = os.getenv("CONTENT_PRODUCTION_FFPROBE", "ffprobe")
    base = [probe, "-v", "error", "-of", "json"]
    streams = json.loads(command(base + ["-show_streams", str(video)], work / "qc-streams.json",
                                  work, tick, deadline, lock_fd))["streams"]
    data = json.loads(command(base + ["-select_streams", "v:0", "-show_frames", "-show_entries",
                                     "frame=best_effort_timestamp_time", str(video)], work / "qc-pts.json",
                             work, tick, deadline, lock_fd))["frames"]
    pts = [number(frame["best_effort_timestamp_time"]) for frame in data]
    if len(pts) != frames or not pts:
        raise ValueError("frame mapping mismatch")
    video_streams = [s for s in streams if s["codec_type"] == "video"]
    audio_streams = [s for s in streams if s["codec_type"] == "audio"]
    if len(video_streams) != 1 or len(audio_streams) != 1:
        raise ValueError("expected one video and normalized audio stream")
    audio = audio_streams[0]
    start = number(audio["start_time"]) - pts[0]
    end = number(audio["start_time"]) + number(audio["duration"]) - (pts[-1] + 1 / 30)
    gaps = [{"frame": index + 1, "deltaMs": round((right - left) * 1000, 3)}
            for index, (left, right) in enumerate(zip(pts, pts[1:]))
            if right <= left or right - left > settings.pts_gap_seconds + 1e-6]
    return {"status": "failed" if gaps or max(abs(start), abs(end)) > settings.av_offset_seconds + 1e-6 else "passed",
            "frameCount": len(pts), "timestampGapCount": len(gaps), "timestampGaps": gaps[:20],
            "audioStartOffsetMs": round(start * 1000, 3), "audioEndOffsetMs": round(end * 1000, 3),
            "videoStartSeconds": pts[0]}


def freezes(source, duration, settings, work, tick, deadline, name, lock_fd=None, start=0, minimum=None):
    # Input paths/URLs are exclusively host-resolved. Never include them in the report.
    ffmpeg = os.getenv("CONTENT_PRODUCTION_FFMPEG", "ffmpeg")
    threshold = settings.freeze_seconds if minimum is None else minimum
    # FFmpeg compares frame PTS, excluding the held duration of the last frame.
    # Detect one frame earlier, then apply the actual interval threshold below.
    detection = max(0.000001, threshold - 1 / 30) if minimum is None else threshold
    args = [ffmpeg, "-nostdin", "-v", "error"]
    if str(source).startswith("https://"):
        args += ["-rw_timeout", "10000000", "-protocol_whitelist", "https,tls,tcp,crypto"]
    args += ["-ss", f"{start:.6f}", "-i", str(source), "-t", f"{duration:.6f}", "-an", "-vf",
             f"setpts=PTS-STARTPTS,scale=160:-2,freezedetect=n={settings.freeze_noise_db}dB:d={detection:.6f},"
             "metadata=mode=add:key=aios.qc_frame:value=1,metadata=mode=print:file=-",
             "-f", "null", "-"]
    metadata = command(args, work / f"qc-freeze-{name}.txt", work, tick, deadline, lock_fd)
    intervals, pending, pts = [], None, []
    for line in metadata.splitlines():
        if line.startswith("frame:"):
            pts.append(number(re.search(r"pts_time:([^ ]+)", line)[1]))
        if line.startswith("lavfi.freezedetect.freeze_start="):
            if pending is not None:
                raise ValueError("invalid freeze metadata")
            pending = number(line.split("=", 1)[1])
        elif line.startswith("lavfi.freezedetect.freeze_end="):
            if pending is None:
                raise ValueError("invalid freeze metadata")
            intervals.append((pending, min(duration, number(line.split("=", 1)[1]))))
            pending = None
    if len(pts) < 2:
        raise ValueError("source window incomplete")
    step = statistics.median(b - a for a, b in zip(pts, pts[1:]))
    observed_end = pts[-1] + step
    if step <= 0 or observed_end < duration - 1 / 30 - 1e-6:
        raise ValueError("source window truncated")
    if pending is not None:
        intervals.append((pending, min(observed_end, duration)))
    return [(a, b) for a, b in intervals if b - a + 1e-6 >= threshold]


def freeze_check(video, spans, frames, resolve_source, settings, work, tick, deadline, lock_fd=None):
    events = freezes(video, frames / 30, settings, work, tick, deadline, "output", lock_fd)
    if len(events) > 100:
        raise ValueError("too many freeze events")
    findings = []
    for index, (start, end) in enumerate(events):
        parts = []
        for span in spans:
            left, right = max(start, span["startFrame"] / 30), min(end, span["endFrame"] / 30)
            if right <= left:
                continue
            raw_start = span["sourceStartMs"] / 1000 + left - span["startFrame"] / 30
            # A 1-frame tolerance covers CFR rounding; source checks use a shorter
            # minimum so a seam-spanning event must still be static on BOTH sides.
            pad = 1 / 30
            seek = max(0, raw_start - pad)
            duration = right - left + raw_start - seek + pad
            original = freezes(resolve_source(span["assetId"]), duration, settings, work, tick, deadline,
                               f"source-{index}-{span['clipOrdinal']}", lock_fd, seek, minimum=1 / 30 + 0.000002)
            exempt = any(a <= raw_start - seek + pad + 1e-6
                         and b >= raw_start - seek + right - left - pad - 1e-6 for a, b in original)
            parts.append({"clipOrdinal": span["clipOrdinal"], "sourceStartMs": round(raw_start * 1000),
                          "sourceAlreadyStatic": exempt})
        findings.append({"startMs": round(start * 1000), "endMs": round(end * 1000),
                         "sourceExempt": bool(parts) and all(p["sourceAlreadyStatic"] for p in parts), "parts": parts})
    return {"status": "failed" if any(not event["sourceExempt"] for event in findings) else "passed",
            "events": findings, "method": "freezedetect-source-window-v1"}
