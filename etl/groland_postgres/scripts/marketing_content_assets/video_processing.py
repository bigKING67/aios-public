from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from .models import ProcessedVideo, VideoProbe


class VideoProcessingError(RuntimeError):
  pass


def ensure_ffmpeg_available() -> None:
  if not shutil.which("ffmpeg"):
    raise VideoProcessingError("未找到 ffmpeg，无法生成 preview/cover")
  if not shutil.which("ffprobe"):
    raise VideoProcessingError("未找到 ffprobe，无法读取视频元数据")


def process_video(input_path: Path, output_dir: Path, stem: str) -> ProcessedVideo:
  ensure_ffmpeg_available()
  output_dir.mkdir(parents=True, exist_ok=True)
  preview_path = output_dir / f"{stem}.preview.mp4"
  cover_path = output_dir / f"{stem}.cover.webp"
  _run([
    "ffmpeg",
    "-y",
    "-i",
    str(input_path),
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "26",
    "-maxrate",
    "1500k",
    "-bufsize",
    "3000k",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    str(preview_path),
  ])
  _run([
    "ffmpeg",
    "-y",
    "-ss",
    "1",
    "-i",
    str(input_path),
    "-frames:v",
    "1",
    "-vf",
    "scale='min(960,iw)':-2",
    "-quality",
    "72",
    str(cover_path),
  ])
  return ProcessedVideo(
    preview_path=preview_path,
    cover_path=cover_path,
    probe=probe_video(input_path),
  )


def build_analysis_proxy_video(
  input_path: Path,
  output_dir: Path,
  stem: str,
  *,
  target_size_bytes: int,
  max_width: int = 960,
  start_seconds: float | None = None,
  duration_seconds: float | None = None,
) -> Path:
  ensure_ffmpeg_available()
  output_dir.mkdir(parents=True, exist_ok=True)
  proxy_path = output_dir / f"{stem}.analysis-proxy.mp4"
  probe = probe_video(input_path)
  effective_duration_seconds = duration_seconds or probe.duration_seconds
  bitrate_candidates = _analysis_proxy_bitrate_candidates(effective_duration_seconds, target_size_bytes)
  for video_bitrate_kbps in bitrate_candidates:
    args = ["ffmpeg", "-y"]
    if start_seconds is not None and start_seconds > 0:
      args.extend(["-ss", f"{start_seconds:.3f}"])
    args.extend([
      "-i",
      str(input_path),
    ])
    if duration_seconds is not None and duration_seconds > 0:
      args.extend(["-t", f"{duration_seconds:.3f}"])
    args.extend([
      "-vf",
      f"scale='min({max_width},iw)':-2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      f"{video_bitrate_kbps}k",
      "-maxrate",
      f"{video_bitrate_kbps}k",
      "-bufsize",
      f"{video_bitrate_kbps * 2}k",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-movflags",
      "+faststart",
      str(proxy_path),
    ])
    _run(args)
    if proxy_path.stat().st_size <= target_size_bytes:
      return proxy_path
  raise VideoProcessingError(
    f"analysis_proxy 仍超过目标大小 {target_size_bytes} bytes: {proxy_path.stat().st_size} bytes"
  )


def extract_analysis_frames(
  input_path: Path,
  output_dir: Path,
  stem: str,
  *,
  timestamps_seconds: list[float],
  max_width: int = 960,
) -> list[Path]:
  ensure_ffmpeg_available()
  output_dir.mkdir(parents=True, exist_ok=True)
  frame_paths: list[Path] = []
  for index, timestamp in enumerate(timestamps_seconds, start=1):
    frame_path = output_dir / f"{stem}.frame-{index:02d}.jpg"
    _run([
      "ffmpeg",
      "-y",
      "-ss",
      f"{max(0.0, timestamp):.3f}",
      "-i",
      str(input_path),
      "-frames:v",
      "1",
      "-vf",
      f"scale='min({max_width},iw)':-2",
      "-q:v",
      "4",
      str(frame_path),
    ])
    if frame_path.exists() and frame_path.stat().st_size > 0:
      frame_paths.append(frame_path)
  return frame_paths


def probe_video(input_path: Path) -> VideoProbe:
  output = _run([
    "ffprobe",
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,duration",
    "-show_format",
    "-of",
    "json",
    str(input_path),
  ], capture=True)
  try:
    payload = json.loads(output or "{}")
  except json.JSONDecodeError:
    return VideoProbe()
  stream = (payload.get("streams") or [{}])[0] if isinstance(payload.get("streams"), list) else {}
  fmt = payload.get("format") if isinstance(payload.get("format"), dict) else {}
  duration = _safe_float(stream.get("duration")) or _safe_float(fmt.get("duration"))
  return VideoProbe(
    duration_seconds=duration,
    width=_safe_int(stream.get("width")),
    height=_safe_int(stream.get("height")),
  )


def _run(args: list[str], capture: bool = False) -> str:
  try:
    result = subprocess.run(
      args,
      check=True,
      text=True,
      stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
      stderr=subprocess.PIPE,
    )
  except subprocess.CalledProcessError as error:
    stderr = (error.stderr or "").strip()
    raise VideoProcessingError(f"视频处理失败: {' '.join(args[:3])}; {stderr[-600:]}") from error
  return result.stdout if capture else ""


def _safe_int(value: object) -> int | None:
  try:
    if value is None or str(value).strip() == "":
      return None
    return int(float(str(value)))
  except (TypeError, ValueError):
    return None


def _safe_float(value: object) -> float | None:
  try:
    if value is None or str(value).strip() == "":
      return None
    return float(str(value))
  except (TypeError, ValueError):
    return None


def _analysis_proxy_bitrate_candidates(duration_seconds: float | None, target_size_bytes: int) -> list[int]:
  if not duration_seconds or duration_seconds <= 0:
    return [900, 700, 500, 320]
  target_total_kbps = int((target_size_bytes * 8 / duration_seconds) / 1000 * 0.88)
  first = max(260, min(1800, target_total_kbps - 64))
  candidates = [first, int(first * 0.78), int(first * 0.58), 320, 260]
  deduped: list[int] = []
  for value in candidates:
    normalized = max(220, min(1800, int(value)))
    if normalized not in deduped:
      deduped.append(normalized)
  return deduped
