"""Technical media acceptance only. Visual/listening/semantic quality is separate."""
import json
import math
import subprocess
import time
from fractions import Fraction
from pathlib import Path
from .execution import file_hash, renderer_env
from .output_profile import canvas, profile_name
from . import remix_mediakit


def inspect_output(video: Path, snapshot: dict, preview: bool, receipt: dict, tick, lock_fd: int | None = None) -> dict:
    if receipt.get("engine") == remix_mediakit.ENGINE:
        # Millisecond timeline rounded once (MediaKit), not the renderer's per-clip floor grid.
        frames = remix_mediakit.timeline_frames(snapshot)
    else:
        frames = sum((c["endMs"] - c["startMs"]) * 30 // 1000 for c in snapshot["clips"])
    sources = {"a" + a["assetId"].replace("-", ""): a["sha256"] for a in snapshot["assets"]}
    return inspect_media(video, canvas(snapshot, preview), frames, sources, profile_name(snapshot),
                         preview, receipt, tick, lock_fd)


def inspect_media(video: Path, expected: dict, frames: int, sources: dict, profile: str,
                  preview: bool, receipt: dict, tick, lock_fd: int | None = None,
                  require_audio: bool = False) -> dict:
    tick()
    inherited = () if lock_fd is None else (lock_fd,)
    env = renderer_env(video.parent)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)],
                           env=env, capture_output=True, check=True, timeout=30, pass_fds=inherited)
    data = json.loads(probe.stdout)
    videos = [s for s in data["streams"] if s["codec_type"] == "video"]
    audios = [s for s in data["streams"] if s["codec_type"] == "audio"]
    if len(videos) != 1 or len(audios) > 1:
        raise ValueError("unexpected output streams")
    if require_audio and (len(audios) != 1 or audios[0].get("sample_rate") != "48000" or audios[0].get("channels") != 2):
        raise ValueError("missing or incompatible independent audio output")
    stream = videos[0]
    fps = float(Fraction(stream["avg_frame_rate"]))
    duration = float(stream.get("duration", data["format"]["duration"]))
    width, height = expected["width"], expected["height"]
    digest = file_hash(video)
    output = receipt.get("output", {})
    actual_sources = {a["id"]: a["sha256"] for a in receipt.get("assets", [])}
    if (not math.isfinite(duration) or abs(duration - frames / 30) > 2 / 30
            or abs(fps - 30) > 0.001 or (stream["width"], stream["height"]) != (width, height)
            or stream["codec_name"] != "h264" or any(a["codec_name"] != "aac" for a in audios)
            or receipt.get("status") != "completed" or receipt.get("preview") is not preview
            or output.get("sha256") != digest or actual_sources != sources):
        raise ValueError("output differs from frozen edit/receipt")
    # Decode the actual file; maintain heartbeat and terminate only this owned child on cancellation.
    with (video.parent / "host-decode.log").open("wb") as log:
        proc = subprocess.Popen(["ffmpeg", "-v", "error", "-xerror", "-i", str(video), "-f", "null", "-"],
                                env=env, stdout=subprocess.DEVNULL, stderr=log, pass_fds=inherited)
        started = time.monotonic()
        try:
            while proc.poll() is None:
                tick()
                if time.monotonic() - started > 180:
                    raise TimeoutError("output decode timed out")
                time.sleep(0.1)
            if proc.returncode:
                raise ValueError("output decode failed")
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
    tick()
    return {"schema": "aios.media-inspection.v1", "scope": "technical", "status": "passed",
            "decode": "passed", "sha256": digest, "durationSeconds": duration,
            "width": width, "height": height, "fps": fps,
            "outputProfile": profile,
            "visual": "unverified", "listening": "unverified", "semantic": "unverified"}
