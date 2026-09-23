"""Offline source-bound cut candidates. No semantic model, upload or database writes."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from .execution import file_hash


SCHEMA = "aios.shot-catalog.v1"


def run(command: list[str], *, timeout: int, stderr=None, env=None) -> bytes:
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=stderr or subprocess.PIPE,
                                timeout=timeout, check=False, env=env)
    except subprocess.TimeoutExpired as exc:
        raise ValueError("Media operation timed out; no catalog published") from exc
    if result.returncode:
        # FFmpeg errors can contain paths or URLs. Keep CLI diagnostics bounded and generic.
        raise ValueError("Media operation failed; no catalog published")
    return result.stdout


def probe(source: Path, ffprobe: str, *, env=None) -> dict:
    payload = json.loads(run([ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(source)], timeout=30, env=env))
    streams = [s for s in payload.get("streams", []) if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")]
    if len(streams) != 1:
        raise ValueError("Exactly one non-cover video stream is required")
    stream = streams[0]
    duration = float(stream.get("duration") or payload.get("format", {}).get("duration") or 0)
    start = float(stream.get("start_time") or 0)
    format_start = float(payload.get("format", {}).get("start_time") or 0)
    if not math.isfinite(duration) or not 0.25 <= duration <= 1800:
        raise ValueError("Video duration must be 0.25–1800 seconds")
    if not math.isfinite(start) or not math.isfinite(format_start) or abs(start) > 0.001 or abs(format_start) > 0.001:
        raise ValueError("Nonzero media timestamps require an explicit time mapping")
    return {"durationMs": math.floor(duration * 1000), "width": int(stream["width"]),
            "height": int(stream["height"]), "streamIndex": int(stream["index"])}


def partition(duration_ms: int, candidates: list[int], min_shot_ms: int = 250) -> list[tuple[int, int]]:
    if duration_ms < min_shot_ms:
        raise ValueError("Video is shorter than minimum shot length")
    cuts = [0]
    for cut in sorted(set(candidates)):
        if 0 < cut < duration_ms and cut - cuts[-1] >= min_shot_ms and duration_ms - cut >= min_shot_ms:
            cuts.append(cut)
    cuts.append(duration_ms)
    if len(cuts) > 121:
        raise ValueError("More than 120 cut candidates; adjust threshold explicitly")
    return list(zip(cuts[:-1], cuts[1:]))


def parse_boundaries(log: str) -> list[int]:
    # Only showinfo frame lines, never duration/progress timestamps.
    return [round(float(value) * 1000) for value in re.findall(r"\[Parsed_showinfo_[^\]]+\].*?\bpts_time:([0-9]+(?:\.[0-9]+)?)", log)]


def build_catalog(source: Path, output: Path, asset_id: str, *, ffmpeg: str, ffprobe: str,
                  threshold: float = 0.3, expected_sha256: str | None = None) -> dict:
    asset_id = str(uuid.UUID(asset_id))
    if not math.isfinite(threshold) or not 0.05 <= threshold <= 0.9:
        raise ValueError("Scene threshold must be between 0.05 and 0.9")
    if source.is_symlink() or not source.is_file() or source.stat().st_size > 1024 ** 3:
        raise ValueError("Source must be a regular local video <=1 GiB")
    if output.exists():
        raise ValueError("Output already exists; choose a new directory")
    source = source.resolve()
    identity = file_hash(source)
    if expected_sha256 is not None and identity != expected_sha256.lower():
        raise ValueError("Source hash differs from the asset identity")
    metadata = probe(source, ffprobe)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".shot-catalog-", dir=output.parent) as temporary:
        staging = Path(temporary)
        log_path = staging / "detection.log"
        with log_path.open("wb") as log:
            run([ffmpeg, "-nostdin", "-xerror", "-hide_banner", "-i", str(source), "-map", f"0:{metadata['streamIndex']}",
                 "-vf", f"select=gt(scene\\,{threshold}),showinfo", "-an", "-f", "null", "-"], timeout=300, stderr=log)
        if log_path.stat().st_size > 8 * 1024 * 1024:
            raise ValueError("Unexpected detector output size")
        ranges = partition(metadata["durationMs"], parse_boundaries(log_path.read_text(errors="replace")))
        shots = []
        frames = staging / "frames"
        frames.mkdir()
        for index, (start, end) in enumerate(ranges):
            shot_id = hashlib.sha256(f"{identity}:{start}:{end}".encode()).hexdigest()[:24]
            requested_at = (start + end) // 2
            name = f"frames/{index + 1:04d}-{shot_id}.jpg"
            run([ffmpeg, "-nostdin", "-xerror", "-v", "error", "-ss", f"{requested_at / 1000:.3f}", "-i", str(source),
                 "-map", f"0:{metadata['streamIndex']}", "-frames:v", "1", "-vf", "scale=480:480:force_original_aspect_ratio=decrease",
                 "-q:v", "3", str(staging / name)], timeout=30)
            if not (staging / name).is_file() or not (staging / name).stat().st_size:
                raise ValueError("Representative frame could not be decoded")
            shots.append({"shotId": shot_id, "startMs": start, "endMs": end,
                          "representativeFrame": {"path": name, "requestedAtMs": requested_at,
                                                  "sha256": file_hash(staging / name)},
                          "semanticStatus": "not_analyzed", "observations": None})
        if file_hash(source) != identity:
            raise ValueError("Source changed during analysis; no catalog published")
        version = run([ffmpeg, "-version"], timeout=10).decode().splitlines()[0]
        manifest = {"schema": SCHEMA, "assetId": asset_id, "rawSha256": identity,
                    "source": metadata, "timebase": "raw-relative-ms", "coverage": "complete",
                    "detector": {"method": "ffmpeg-scene", "threshold": threshold, "minShotMs": 250,
                                 "version": version, "status": "cut_candidates_need_review"}, "shots": shots}
        (staging / "catalog.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        log_path.unlink()
        # Never replace a prior run. Reserve output before publishing; catalog is written last.
        output.mkdir()
        shutil.move(str(frames), str(output / "frames"))
        shutil.move(str(staging / "catalog.json"), str(output / "catalog.json"))
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--threshold", type=float, default=0.3)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()
    try:
        result = build_catalog(args.source, args.output, args.asset_id, ffmpeg=args.ffmpeg, ffprobe=args.ffprobe,
                               threshold=args.threshold, expected_sha256=args.expected_sha256)
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        # Avoid raw subprocess/configuration details in normal CLI output.
        parser.exit(1, f"Shot catalog failed ({type(error).__name__}); check local source, tools and output directory.\n")
    print(json.dumps({"status": "completed", "shots": len(result["shots"]), "durationMs": result["source"]["durationMs"],
                      "rawSha256": result["rawSha256"], "semanticStatus": "not_analyzed", "output": str(args.output)}))


if __name__ == "__main__":
    main()
