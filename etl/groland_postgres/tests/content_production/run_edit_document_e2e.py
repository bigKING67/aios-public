"""Explicit local render acceptance; generates media, never uploads or calls models."""
import argparse
import array
import json
import math
import os
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.execution import file_hash
from content_production.render_document import render_document_local
from content_production.reference_edit import build_reference_edit
from edit_document_fixture import fixture


def command(args):
    return subprocess.run(args, check=True, capture_output=True, timeout=60).stdout


def pcm(path, start=0, duration=4):
    samples = array.array("f")
    samples.frombytes(command(["ffmpeg", "-v", "error", "-i", str(path), "-ss", str(start), "-t", str(duration),
                               "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "-"]))
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", type=Path, required=True)
    parser.add_argument("--chrome", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--reference-assembly", action="store_true")
    args = parser.parse_args()
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    os.environ["PRODUCER_HEADLESS_SHELL_PATH"] = args.chrome
    document, bindings, media = fixture()
    document["canvas"].update(width=1920, height=1080)
    for asset, color, signal in zip(document["assets"], ("red", "blue", "green"),
                                    ("0.2*sin(2*PI*900*t)", "0.2*sin(2*PI*1400*t)", "0.2*sin(2*PI*(220*t+30*t*t))")):
        source = args.output / (asset["ref"] + ".mp4")
        seconds = 2 if args.reference_assembly and asset["ref"] == "blue" else 6
        command(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color={color}:size=640x360:rate=30:duration={seconds}",
                 "-f", "lavfi", "-i", f"aevalsrc={signal}:s=48000:d={seconds}", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest", str(source)])
        digest = file_hash(source)
        asset["sha256"] = bindings[asset["assetVersionId"]]["sha256"] = digest
        bindings[asset["assetVersionId"]]["durationMs"] = seconds * 1000
        media[asset["assetVersionId"]] = source
    if args.reference_assembly:
        def frozen(version, frames):
            return {"assetVersionId": version, "sha256": bindings[version]["sha256"], "frames": frames}
        document = build_reference_edit("reference-fixture", 1, frozen("voice-version", 180),
                                        [{"startFrame": 60, "endFrame": 120, "asset": frozen("blue-version", 60)}],
                                        document["canvas"])
    work = args.output / "work"
    work.mkdir()
    video, receipt = render_document_local(args.module, document, bindings, media, "Independent audio B-roll",
                                            work, False, lambda: None)
    # Read every output frame; reference assembly also verifies untouched tail.
    pixels = command(["ffmpeg", "-v", "error", "-i", str(video), "-an", "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"])
    frames = 180 if args.reference_assembly else 120
    duration = frames // 30
    if len(pixels) != frames * 3:
        raise AssertionError(f"wrong decoded frame count: {len(pixels) // 3}")
    for frame in range(frames):
        red, green, blue = pixels[frame * 3:frame * 3 + 3]
        expected_blue = 60 <= frame < 120
        expected = (blue > 220 and green < 30 and red < 30) if expected_blue else (
            (90 < green < 150 and red < 30 and blue < 30) if args.reference_assembly else
            (red > 220 and green < 30 and blue < 30))
        if not expected:
            raise AssertionError(f"wrong picture at frame {frame}: {(red, green, blue)}")
    reference = pcm(media["voice-version"], 0 if args.reference_assembly else 1, duration)
    actual = pcm(video, duration=duration)
    if min(len(reference), len(actual)) < duration * 48000:
        raise AssertionError("audio duration shorter than picture")
    # AAC re-encoding changes samples; compare normalized signal across bounded
    # encoder alignment, then measure every 100 ms including the B-roll cut.
    indices = range(4800, duration * 48000 - 4800, 8)
    def correlation(lag):
        dot = sum(reference[i] * actual[i + lag] for i in indices)
        energy = sum(reference[i] ** 2 for i in indices) * sum(actual[i + lag] ** 2 for i in indices)
        return dot / math.sqrt(energy)
    corr, lag = max((correlation(lag), lag) for lag in range(-96, 97))
    if corr < 0.99:
        raise AssertionError(f"narration replaced, shifted or contaminated: correlation={corr}")
    ratios = []
    for start in range(4800, duration * 48000 - 4800, 4800):
        a = sum(actual[i + lag] ** 2 for i in range(start, start + 4800))
        b = sum(reference[i] ** 2 for i in range(start, start + 4800))
        ratios.append(math.sqrt(a / b))
    if not all(0.9 < ratio < 1.1 for ratio in ratios):
        raise AssertionError("audio discontinuity or incorrect gain")
    evidence = {"schema": "aios.av-acceptance.v1", "status": "passed", "video": str(video),
                "framesVerified": frames, "pictureCutFrame": 60, "sourceAudioMuted": True,
                "referenceAssembly": args.reference_assembly, "productSwapModel": "not_called",
                "narrationCorrelation": corr, "alignmentSamples": lag,
                "audioWindowRmsRatioMin": min(ratios), "audioWindowRmsRatioMax": max(ratios),
                "semanticQuality": "unverified", "humanListening": "unverified", "productionDeployment": "unverified"}
    for name, value in (("edit-document.json", document), ("receipt.json", receipt), ("acceptance.json", evidence)):
        (args.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2))
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == "__main__":
    main()
