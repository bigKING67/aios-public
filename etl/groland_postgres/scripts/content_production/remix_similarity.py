"""Bounded, advisory cross-source picture review of the actual normalized render.

Two successive 2 fps samples must be close in RGB composition. This is not
identity recognition, speech deduplication, or permission to discard a clip.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import time

import numpy as np

from .execution import Cancelled, file_hash, renderer_env
from .workspace import WorkspaceLimit

SCHEMA = "aios.remix-picture-review.v1"
FPS, STEP, WIDTH, HEIGHT = 30, 15, 32, 56
MAX_FRAMES, MAX_CLIPS, MAX_FINDINGS, TIMEOUT = 18000, 60, 20, 45
MAX_DISTANCE, MIN_TEXTURE = 0.10, 0.04


def windows(snapshot, receipt):
    """Use measured render frames, including the cloud renderer's rounding."""
    normalized = receipt["host_output_normalization"]
    measured = normalized["segmentLoudness"]["clips"]
    clips = snapshot["clips"]
    if not 1 <= len(clips) <= MAX_CLIPS or len(measured) != len(clips):
        raise ValueError("unsupported clip count")
    hashes = {a["assetId"]: a["sha256"] for a in snapshot["assets"]}
    result, offset = [], 0
    for index, (clip, measure) in enumerate(zip(clips, measured)):
        frames = measure["renderedFrames"]
        if (type(frames) is not int or frames < 1 or measure["clipId"] != clip["id"]
                or measure["assetId"] != clip["assetId"] or measure["sourceStartMs"] != clip["startMs"]):
            raise ValueError("invalid render mapping")
        result.append({"clipOrdinal": index + 1, "assetId": clip["assetId"],
            "sourceSha256": hashes[clip["assetId"]], "sourceStartMs": clip["startMs"],
            "startFrame": offset, "endFrame": offset + frames})
        offset += frames
    if offset != normalized["output"]["videoFrames"] or offset > MAX_FRAMES:
        raise ValueError("unsupported render length")
    return result, offset


def extract(video: Path, work: Path, total: int, tick, deadline, lock_fd=None):
    target = work / "remix-picture-review.rgb"
    count = math.ceil(total / STEP)
    tick()
    with (work / "remix-picture-review.log").open("wb") as log:
        process = subprocess.Popen([
            os.getenv("CONTENT_PRODUCTION_FFMPEG", "ffmpeg"), "-nostdin", "-hide_banner",
            "-loglevel", "error", "-y", "-i", str(video), "-an", "-vf",
            f"select=not(mod(n\\,{STEP})),scale={WIDTH}:{HEIGHT}", "-fps_mode", "vfr",
            "-frames:v", str(count + 1), "-pix_fmt", "rgb24", "-f", "rawvideo", str(target),
        ], env=renderer_env(work), stdout=subprocess.DEVNULL, stderr=log,
            pass_fds=() if lock_fd is None else (lock_fd,))
        try:
            while process.poll() is None:
                tick()
                if time.monotonic() > deadline:
                    raise TimeoutError("picture review deadline")
                time.sleep(0.1)
            tick()
            if process.returncode or target.stat().st_size != count * WIDTH * HEIGHT * 3:
                raise ValueError("incomplete sample extraction")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)
    return np.frombuffer(target.read_bytes(), dtype=np.uint8).reshape(count, HEIGHT, WIDTH, 3)


def point(window, sample):
    frame = int(sample) * STEP
    return {"clipOrdinal": window["clipOrdinal"], "assetId": window["assetId"],
        "sourceSha256": window["sourceSha256"], "outputStartMs": round(frame * 1000 / FPS),
        "sourceStartMs": round(window["sourceStartMs"] + (frame - window["startFrame"]) * 1000 / FPS),
        "sampleSpanMs": STEP * 1000 // FPS}


def compare(samples, spans, tick, deadline):
    pictures = samples.astype(np.float32) / 255
    # Exclude flat color/black samples; RGB channel differences alone are not texture.
    texture = pictures.std(axis=(1, 2)).mean(axis=1)
    positions = np.arange(len(pictures)) * STEP
    eligible = []
    for span in spans:
        indices = np.flatnonzero((positions >= span["startFrame"] + 2)
                                & (positions + STEP < span["endFrame"] - 2))
        eligible.append(indices[(texture[indices] >= MIN_TEXTURE) & (texture[indices + 1] >= MIN_TEXTURE)])
    findings, pairs = [], 0
    for i, left in enumerate(spans):
        for j in range(i + 1, len(spans)):
            right, targets = spans[j], eligible[j]
            if left["assetId"] == right["assetId"] or not len(targets):
                continue
            best = None
            for source in eligible[i]:
                tick()
                if time.monotonic() > deadline:
                    raise TimeoutError("picture review deadline")
                distances = np.maximum(
                    np.abs(pictures[targets] - pictures[source]).mean(axis=(1, 2, 3)),
                    np.abs(pictures[targets + 1] - pictures[source + 1]).mean(axis=(1, 2, 3)))
                match = int(np.argmin(distances))
                distance = float(distances[match])
                if distance <= MAX_DISTANCE and (best is None or distance < best[0]):
                    best = (distance, int(source), int(targets[match]))
            if best is not None:
                pairs += 1
                if len(findings) < MAX_FINDINGS:
                    findings.append({"left": point(left, best[1]), "right": point(right, best[2]),
                                     "distance": round(best[0], 5), "matchedSamples": 2})
    return findings, pairs


def review(snapshot, video: Path, receipt, work: Path, tick, lock_fd=None):
    report = {"schema": SCHEMA, "status": "incomplete", "deliveryApproved": False,
        "method": "rgb-composition-two-samples-v1", "samplingFps": FPS // STEP,
        "maxDistance": MAX_DISTANCE, "minTexture": MIN_TEXTURE,
        "maxDurationSeconds": MAX_FRAMES // FPS, "timeoutSeconds": TIMEOUT,
        "findings": [], "pairCount": 0, "sampleCount": 0,
        "limitations": ["sampled_picture_only", "speech_unchecked", "identity_unchecked", "human_review_required"]}
    stage = "binding"
    deadline = time.monotonic() + TIMEOUT
    try:
        tick()
        digest = file_hash(video)
        report["outputSha256"] = digest
        report["snapshotSha256"] = hashlib.sha256(json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        if (receipt["host_inspection"]["status"] != "passed"
                or receipt["host_inspection"]["sha256"] != digest
                or receipt["host_output_normalization"]["output"]["sha256"] != digest):
            raise ValueError("output binding mismatch")
        stage = "mapping"
        spans, total = windows(snapshot, receipt)
        if len({s["assetId"] for s in spans}) < 2:
            report["status"] = "not_applicable"
            return report
        stage = "sampling"
        samples = extract(video, work, total, tick, deadline, lock_fd)
        report["sampleCount"] = len(samples)
        stage = "comparison"
        findings, pairs = compare(samples, spans, tick, deadline)
        report.update(status="review_required" if pairs else "no_findings", findings=findings, pairCount=pairs)
    except (Cancelled, WorkspaceLimit):
        raise
    except Exception as error:
        # Advisory failures remain visible without destroying an otherwise valid render.
        report.update(status="incomplete", errorStage=stage, errorType=type(error).__name__)
    return report
