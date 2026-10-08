"""Framework remix loudness and delivery encoding (technical, framework_remix only).

Before rendering, each clip's rendered source window is measured with ffmpeg
ebur128. The content-locked renderer only accepts clip volume 0..1, so the
per-clip gain (target - I, clamped) is applied after rendering instead: one
host ffmpeg pass multiplies each output window by its gain, applies a
two-pass loudnorm and re-encodes to the fixed delivery profile. The frozen
snapshot/spec is never changed. The final file replaces the renderer output
before technical inspection, so inspection, upload and asset registration all
describe the delivered bytes. Listening quality stays unverified.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import math
import os
import re
import subprocess
import time
from pathlib import Path

from .execution import file_hash, renderer_env
from .output_profile import canvas

SCHEMA = "aios.remix-output-normalization.v1"
FPS = 30
SAMPLE_RATE = 48000
SILENCE_LUFS = -70.0  # ebur128 absolute gate: nothing above it was measured.
X264_PRESETS = ("ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow")
LOUDNORM_MEASURED = ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")
BITRATE = re.compile(r"[1-9][0-9]{0,5}(\.[0-9]{1,3})?[kM]")


class NormalizationError(RuntimeError):
    pass


def _number(name: str, default: float, low: float, high: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ValueError(f"{name} must be a number") from None
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{name} must be within {low}..{high}")
    return value


def _choice(name: str, default: str, valid) -> str:
    value = os.environ.get(name, "").strip() or default
    if not valid(value):
        raise ValueError(f"{name} is invalid")
    return value


def bitrate_bits(value: str) -> int:
    return round(float(value[:-1]) * (1000 if value[-1] == "k" else 1_000_000))


@dataclass(frozen=True)
class Settings:
    segment_target_lufs: float = -16.0
    max_gain_db: float = 12.0
    target_lufs: float = -14.0
    true_peak_dbtp: float = -1.0
    lra: float = 11.0
    video_bitrate: str = "6M"
    video_maxrate: str = "7.5M"
    video_bufsize: str = "12M"
    x264_preset: str = "medium"
    audio_bitrate: str = "128k"
    timeout_seconds: int = 1800

    @classmethod
    def from_env(cls) -> "Settings":
        prefix = "CONTENT_PRODUCTION_REMIX_"
        rate = lambda value: bool(BITRATE.fullmatch(value))
        settings = cls(
            segment_target_lufs=_number(prefix + "SEGMENT_LUFS", cls.segment_target_lufs, -40, -5),
            max_gain_db=_number(prefix + "SEGMENT_MAX_GAIN_DB", cls.max_gain_db, 0, 24),
            target_lufs=_number(prefix + "OUTPUT_LUFS", cls.target_lufs, -40, -5),
            true_peak_dbtp=_number(prefix + "OUTPUT_TRUE_PEAK", cls.true_peak_dbtp, -9, 0),
            lra=_number(prefix + "OUTPUT_LRA", cls.lra, 1, 50),
            video_bitrate=_choice(prefix + "VIDEO_BITRATE", cls.video_bitrate, rate),
            video_maxrate=_choice(prefix + "VIDEO_MAXRATE", cls.video_maxrate, rate),
            video_bufsize=_choice(prefix + "VIDEO_BUFSIZE", cls.video_bufsize, rate),
            x264_preset=_choice(prefix + "X264_PRESET", cls.x264_preset, lambda value: value in X264_PRESETS),
            audio_bitrate=_choice(prefix + "AUDIO_BITRATE", cls.audio_bitrate, rate),
            timeout_seconds=int(_number(prefix + "NORMALIZE_TIMEOUT_SECONDS", cls.timeout_seconds, 60, 7200)),
        )
        if bitrate_bits(settings.video_maxrate) < bitrate_bits(settings.video_bitrate):
            raise ValueError(prefix + "VIDEO_MAXRATE must not be below VIDEO_BITRATE")
        if not 32_000 <= bitrate_bits(settings.audio_bitrate) <= 512_000:
            raise ValueError(prefix + "AUDIO_BITRATE must be within 32k..512k")
        return settings


def clip_gain_db(integrated_lufs: float | None, settings: Settings) -> float:
    """Gain towards the segment target, clamped; unmeasurable/silent audio is left untouched."""
    if integrated_lufs is None or not math.isfinite(integrated_lufs) or integrated_lufs <= SILENCE_LUFS:
        return 0.0
    gain = settings.segment_target_lufs - integrated_lufs
    return round(max(-settings.max_gain_db, min(settings.max_gain_db, gain)), 2)


def clip_frames(clip: dict) -> int:
    # Same output frame grid as execution.build_spec.
    return int((clip["endMs"] - clip["startMs"]) * FPS // 1000)


def run_ffmpeg(arguments: list[str], log: Path, work: Path, tick, timeout: int, lock_fd: int | None = None) -> str:
    """Run one owned ffmpeg child with heartbeat/cancel; returns its stderr log text."""
    tick()
    inherited = () if lock_fd is None else (lock_fd,)
    with log.open("wb") as stream:
        proc = subprocess.Popen(["ffmpeg", "-nostdin", "-hide_banner", "-nostats", *arguments],
                                env=renderer_env(work), stdout=subprocess.DEVNULL, stderr=stream,
                                pass_fds=inherited)
        started = time.monotonic()
        try:
            while proc.poll() is None:
                tick()
                if time.monotonic() - started > timeout:
                    raise TimeoutError("成片音频与编码统一超时")
                time.sleep(0.2)
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
    text = log.read_text(errors="replace")
    if proc.returncode:
        raise NormalizationError("ffmpeg 音频/编码处理失败")
    tick()
    return text


def probe(file: Path, work: Path, count: bool = False, lock_fd: int | None = None) -> dict:
    inherited = () if lock_fd is None else (lock_fd,)
    extra = ["-count_packets"] if count else []
    result = subprocess.run(["ffprobe", "-v", "error", *extra, "-show_streams", "-show_format", "-of", "json", str(file)],
                            env=renderer_env(work), capture_output=True, check=True, timeout=120, pass_fds=inherited)
    return json.loads(result.stdout)


def parse_integrated(text: str) -> float | None:
    matches = re.findall(r"Integrated loudness:\s*\n\s*I:\s*(-?inf|nan|-?[0-9]+(?:\.[0-9]+)?)\s*LUFS", text)
    if not matches:
        raise NormalizationError("无法读取片段响度测量结果")
    try:
        value = float(matches[-1])
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def measure_command(source: Path, start_ms: float, frames: int) -> list[str]:
    return ["-ss", f"{start_ms / 1000:.3f}", "-t", f"{frames / FPS:.6f}", "-i", str(source),
            "-map", "0:a:0", "-vn", "-af", "ebur128=framelog=verbose", "-f", "null", "-"]


def measure_clips(snapshot: dict, media: dict[str, Path], settings: Settings, work: Path, tick,
                  lock_fd: int | None = None) -> list[dict]:
    """Integrated loudness of each rendered source window (clip volume included)."""
    results, has_audio = [], {}
    logs = work / "loudness"
    logs.mkdir(exist_ok=True)
    for index, clip in enumerate(snapshot["clips"]):
        asset = str(clip["assetId"])
        source = media[asset]
        frames = clip_frames(clip)
        if asset not in has_audio:
            has_audio[asset] = any(s.get("codec_type") == "audio" for s in probe(source, work, lock_fd=lock_fd)["streams"])
        item = {"clipId": clip.get("id") or f"clip{index}", "assetId": asset, "sourceStartMs": clip["startMs"],
                "renderedFrames": frames, "clipVolume": clip["volume"], "integratedLufs": None}
        if not has_audio[asset] or clip["volume"] <= 0:
            item.update(status="no_audio", gainDb=0.0)
        else:
            text = run_ffmpeg(measure_command(source, clip["startMs"], frames), logs / f"clip-{index}.log",
                              work, tick, settings.timeout_seconds, lock_fd)
            loudness = parse_integrated(text)
            if loudness is not None and clip["volume"] != 1:
                loudness += 20 * math.log10(clip["volume"])
            item["integratedLufs"] = None if loudness is None else round(loudness, 2)
            silent = loudness is None or loudness <= SILENCE_LUFS
            item.update(status="silent" if silent else "measured", gainDb=clip_gain_db(loudness, settings))
        item["linearGain"] = round(10 ** (item["gainDb"] / 20), 6)
        results.append(item)
    return results


def measure_rendered_clips(video: Path, snapshot: dict, settings: Settings, work: Path, tick,
                           lock_fd: int | None = None) -> list[dict]:
    """Per-clip integrated loudness measured on the rendered output itself (cloud path, no source download).

    Windows follow the millisecond timeline rounded once to the 30fps grid, which is how
    MediaKit places clips; clip volume is already applied in the output, so no adjustment.
    """
    has_audio = any(s.get("codec_type") == "audio" for s in probe(video, work, lock_fd=lock_fd)["streams"])
    logs = work / "loudness"
    logs.mkdir(exist_ok=True)
    results, elapsed, previous = [], 0, 0
    for index, clip in enumerate(snapshot["clips"]):
        elapsed += clip["endMs"] - clip["startMs"]
        boundary = round(elapsed * FPS / 1000)
        frames, start_frame, previous = boundary - previous, previous, boundary
        item = {"clipId": clip.get("id") or f"clip{index}", "assetId": str(clip["assetId"]),
                "sourceStartMs": clip["startMs"], "renderedFrames": frames, "clipVolume": clip["volume"],
                "integratedLufs": None, "measuredOn": "rendered_output"}
        if not has_audio or clip["volume"] <= 0:
            item.update(status="no_audio", gainDb=0.0)
        else:
            text = run_ffmpeg(measure_command(video, start_frame * 1000 / FPS, frames), logs / f"clip-{index}.log",
                              work, tick, settings.timeout_seconds, lock_fd)
            loudness = parse_integrated(text)
            item["integratedLufs"] = None if loudness is None else round(loudness, 2)
            silent = loudness is None or loudness <= SILENCE_LUFS
            item.update(status="silent" if silent else "measured", gainDb=clip_gain_db(loudness, settings))
        item["linearGain"] = round(10 ** (item["gainDb"] / 20), 6)
        results.append(item)
    return results


def gain_filter(clips: list[dict]) -> str:
    """Piecewise gain on the output timeline; boundaries sit on the 1/30s frame grid.

    160-sample chunks divide one 30fps frame (1600 samples at 48 kHz) exactly, so
    every gain step falls on the clip cut rather than inside a decoded AAC frame.
    """
    boundaries, frames = [], 0
    for clip in clips[:-1]:
        frames += clip["renderedFrames"]
        boundaries.append(frames / FPS - 0.5 / SAMPLE_RATE)
    expression = f"{clips[-1]['linearGain']:.6f}"
    for boundary, clip in reversed(list(zip(boundaries, clips))):
        expression = f"if(lt(t,{boundary:.6f}),{clip['linearGain']:.6f},{expression})"
    return (f"aformat=sample_fmts=fltp:sample_rates={SAMPLE_RATE}:channel_layouts=stereo,"
            f"asetnsamples=n=160:p=0,volume=volume='{expression}':eval=frame")


def loudnorm_filter(settings: Settings, measured: dict | None = None) -> str:
    base = f"loudnorm=I={settings.target_lufs}:TP={settings.true_peak_dbtp}:LRA={settings.lra}"
    if measured is None:
        return base + ":print_format=json"
    # Re-format through float so only validated finite numbers reach the filter graph.
    value = {key: f"{float(measured[key]):.2f}" for key in LOUDNORM_MEASURED}
    return (base + f":measured_I={value['input_i']}:measured_TP={value['input_tp']}"
            f":measured_LRA={value['input_lra']}:measured_thresh={value['input_thresh']}"
            f":offset={value['target_offset']}:linear=true:print_format=json")


def parse_loudnorm(text: str, allow_silent: bool = False) -> dict | None:
    """loudnorm JSON; with allow_silent, an all-silent (-inf) measurement returns None."""
    start = text.rfind("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise NormalizationError("无法读取整体响度测量结果")
    try:
        data = json.loads(text[start:end + 1])
        for key in LOUDNORM_MEASURED:
            float(data[key])
    except (ValueError, KeyError, TypeError):
        raise NormalizationError("整体响度测量结果无效") from None
    if allow_silent and float(data["input_i"]) == float("-inf"):
        return None
    if not all(math.isfinite(float(data[key])) for key in LOUDNORM_MEASURED):
        raise NormalizationError("整体响度无法测量（静音或无效音频）")
    return data


def encode_command(video: Path, output: Path, expected: dict, settings: Settings, audio_filter: str | None,
                   copy_video: bool = False) -> list[str]:
    arguments = ["-i", str(video), "-map", "0:v:0"]
    if audio_filter is not None:
        arguments += ["-map", "0:a:0"]
    if copy_video:
        # Cloud-rendered (MediaKit) video already matches the canvas: only the audio is processed.
        arguments += ["-c:v", "copy"]
    else:
        arguments += ["-vf", f"scale={expected['width']}:{expected['height']}:flags=lanczos,setsar=1,format=yuv420p",
                      "-fps_mode", "passthrough", "-c:v", "libx264", "-preset", settings.x264_preset,
                      "-profile:v", "high", "-b:v", settings.video_bitrate, "-maxrate", settings.video_maxrate,
                      "-bufsize", settings.video_bufsize, "-g", str(2 * FPS), "-pix_fmt", "yuv420p"]
    if audio_filter is not None:
        arguments += ["-af", audio_filter, "-c:a", "aac", "-b:a", settings.audio_bitrate,
                      "-ar", str(SAMPLE_RATE), "-ac", "2"]
    return arguments + ["-map_metadata", "-1", "-movflags", "+faststart", "-f", "mp4", str(output)]


def _streams(data: dict, kind: str) -> list[dict]:
    return [s for s in data["streams"] if s.get("codec_type") == kind]


def finalize(video: Path, receipt: dict, snapshot: dict, clips: list[dict], settings: Settings,
             work: Path, tick, lock_fd: int | None = None, copy_video: bool = False) -> tuple[Path, dict]:
    """Returns the delivered file and the receipt rebound to it; `copy_video` keeps the video stream bytes."""
    if receipt.get("status") != "completed" or file_hash(video) != receipt.get("output", {}).get("sha256"):
        raise NormalizationError("渲染回执与产物不一致")
    expected = canvas(snapshot)
    before = probe(video, work, count=True, lock_fd=lock_fd)
    videos, audios = _streams(before, "video"), _streams(before, "audio")
    if len(videos) != 1 or len(audios) > 1:
        raise NormalizationError("渲染产物流结构异常")
    if copy_video and (videos[0].get("codec_name") != "h264" or (videos[0]["width"], videos[0]["height"])
                       != (expected["width"], expected["height"])):
        raise NormalizationError("云端成片的编码或画幅与成片规格不一致")
    frames = int(videos[0]["nb_read_packets"])
    if audios and abs(float(audios[0]["duration"]) - frames / FPS) > 2 / FPS:
        raise NormalizationError("渲染产物音频时长与画面不一致")
    folder = work / "normalized"
    folder.mkdir()
    output = folder / "video.mp4"
    loudnorm = None
    audio_filter = None
    measured = None
    if audios:
        pre = gain_filter(clips)
        measured = parse_loudnorm(run_ffmpeg(["-i", str(video), "-map", "0:a:0", "-vn", "-af",
                                              pre + "," + loudnorm_filter(settings), "-f", "null", "-"],
                                             folder / "loudnorm-measure.log", work, tick,
                                             settings.timeout_seconds, lock_fd), allow_silent=True)
        if measured is None:
            # All-silent audio track: nothing to normalize; keep the track and encode it unchanged.
            loudnorm = {"status": "silent", "targetLufs": settings.target_lufs}
            audio_filter = f"{pre},aresample={SAMPLE_RATE}"
        else:
            audio_filter = f"{pre},{loudnorm_filter(settings, measured)},aresample={SAMPLE_RATE}"
        # FFmpeg 6.1 dynamic loudnorm can leave EOF timestamps on its 100 ms block
        # grid. Rebuild the sample clock, then bound decoded AAC padding to the
        # video timeline after resampling (1600 samples/frame).
        # Input drift is rejected above; no apad, so missing audio still fails below.
        audio_filter += f",asetpts=N/SR/TB,atrim=end_sample={frames * SAMPLE_RATE // FPS}"
    text = run_ffmpeg(encode_command(video, output, expected, settings, audio_filter, copy_video),
                      folder / "encode.log", work, tick, settings.timeout_seconds, lock_fd)
    if audios and measured is not None:
        applied = parse_loudnorm(text)
        loudnorm = {"targetLufs": settings.target_lufs, "truePeakDbtp": settings.true_peak_dbtp,
                    "lra": settings.lra,
                    "input": {key: float(measured[f"input_{key}"]) for key in ("i", "tp", "lra", "thresh")},
                    "output": {key: float(applied[f"output_{key}"]) for key in ("i", "tp", "lra")},
                    "targetOffset": float(measured["target_offset"]),
                    "normalizationType": applied.get("normalization_type", "unknown")}
    after = probe(output, work, count=True, lock_fd=lock_fd)
    out_videos, out_audios = _streams(after, "video"), _streams(after, "audio")
    if (len(out_videos) != 1 or len(out_audios) != len(audios)
            or out_videos[0].get("nb_read_packets") != videos[0].get("nb_read_packets")
            or (out_videos[0]["width"], out_videos[0]["height"]) != (expected["width"], expected["height"])):
        raise NormalizationError("统一编码后帧数、画幅或音轨与渲染产物不一致")
    frames = int(out_videos[0]["nb_read_packets"])
    if out_audios and abs(float(out_audios[0]["duration"]) - frames / FPS) > 2 / FPS:
        raise NormalizationError(
            "统一编码后音频时长与画面不一致 "
            f"(input_audio={audios[0].get('duration')}s, "
            f"output_audio={out_audios[0]['duration']}s, "
            f"video={frames / FPS:.6f}s, frames={frames}, "
            f"normalization={None if loudnorm is None else loudnorm.get('normalizationType', loudnorm.get('status'))})"
        )
    digest = file_hash(output)
    duration = float(after["format"]["duration"])
    record = {
        "schema": SCHEMA, "scope": "technical", "listening": "unverified",
        "segmentLoudness": {"measurement": "ffmpeg_ebur128_integrated", "targetLufs": settings.segment_target_lufs,
                            "maxGainDb": settings.max_gain_db, "appliedAt": "host_post_render",
                            "clips": clips},
        "loudnorm": loudnorm if loudnorm is not None else {"status": "no_audio"},
        "encode": ({"videoCodec": "copy", "videoSource": receipt.get("engine")} if copy_video else
                   {"videoCodec": "libx264", "preset": settings.x264_preset, "profile": "high",
                    "videoBitrate": settings.video_bitrate, "maxrate": settings.video_maxrate,
                    "bufsize": settings.video_bufsize, "gopFrames": 2 * FPS, "pixFmt": "yuv420p"}) | {
                   "width": expected["width"], "height": expected["height"], "fps": FPS,
                   "audioCodec": "aac" if audios else None, "audioBitrate": settings.audio_bitrate if audios else None,
                   "sampleRate": SAMPLE_RATE if audios else None, "channels": 2 if audios else None,
                   "faststart": True},
        "settings": asdict(settings),
        "rendererOutput": receipt.get("output"),
        "output": {"sha256": digest, "bytes": output.stat().st_size, "durationSeconds": duration,
                   "videoFrames": frames, "bitRate": int(after["format"].get("bit_rate", 0) or 0)},
    }
    receipt["host_output_normalization"] = record
    receipt["output"] = {"file": "video.mp4", "sha256": digest, "duration": duration, "video": True,
                         "audio": bool(out_audios), "width": expected["width"], "height": expected["height"]}
    return output, receipt
