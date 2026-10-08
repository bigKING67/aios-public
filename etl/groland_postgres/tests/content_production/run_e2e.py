"""Orchestrate production HTTP/worker code without importing user env files."""
import argparse
from array import array
import math
import shutil
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import psycopg2

from object_fixture import start_store
from caption_provider_fixture import start_provider


def verify_treated_picture(output, name='treated-video'):
    evidence = json.loads((output / 'treatment-adoption.json').read_text())
    ranges = [(r['startFrame'], r['endFrame']) for r in evidence['sourceTextRouting']['routes']
              if r['assetVersionId'].startswith('treated-')]
    if len(ranges) != 1:
        raise AssertionError('fixture requires exactly one treated slot')
    pixels = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(output / f'{name}.mp4'),
        '-an', '-vf', 'crop=640:200,scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
        check=True, capture_output=True).stdout
    if len(pixels) != 90 * 3:
        raise AssertionError('treated render frame count changed')
    for frame in range(90):
        red, green, blue = pixels[frame * 3:frame * 3 + 3]
        treated = ranges[0][0] <= frame < ranges[0][1]
        correct = red > 220 and green > 220 and blue < 30 if treated else red < 30 and green < 30 and blue > 220
        if not correct:
            raise AssertionError(f'treated/retained picture mismatch at frame {frame}')
    return {'frames': 90, 'treatedRange': list(ranges[0]), 'remainingPicturesPreserved': True}


def verify_restored_captions(output):
    heights = []
    for name in ['treated-caption-restored', 'treated-caption-wrapped']:
        verify_treated_picture(output, name)
        # Synthetic fixture has a black caption area. White glyph rows prove
        # captions were actually rendered, and newline changes affect layout.
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', '0.5', '-i', str(output / f'{name}.mp4'),
            '-frames:v', '1', '-vf', 'crop=1080:400:0:1180', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
            check=True, capture_output=True).stdout
        if len(raw) != 1080 * 400 * 3:
            raise AssertionError('unexpected caption inspection dimensions')
        rows = []
        for y in range(400):
            row = raw[y * 1080 * 3:(y + 1) * 1080 * 3]
            if sum(all(v > 220 for v in row[x:x+3]) for x in range(0, len(row), 3)) > 5:
                rows.append(y)
        if not rows:
            raise AssertionError(f'no visible caption glyphs: {name}')
        heights.append(rows[-1] - rows[0] + 1)
        subprocess.run(['ffmpeg', '-v', 'error', '-ss', '0.5', '-i', str(output / f'{name}.mp4'),
            '-frames:v', '1', '-y', str(output / f'{name}.png')], check=True, capture_output=True)
    if heights[1] <= heights[0] * 1.5:
        raise AssertionError(f'newline did not produce two visible lines: {heights}')
    decoded = []
    for name in ['treated-caption-candidate', 'treated-caption-wrapped']:
        result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(output / f'{name}.mp4'),
            '-an', '-f', 'framemd5', '-'], check=True, capture_output=True, text=True)
        decoded.append([line for line in result.stdout.splitlines() if not line.startswith('#')])
    if len(decoded[0]) != 90 or decoded[0] != decoded[1]:
        raise AssertionError('candidate and adopted decoded video differ')
    (output / 'candidate-adoption-pixels.json').write_text(json.dumps({
        'frames': 90, 'decodedCandidateAndAdoptedVideoIdentical': True,
        'scope': 'local synthetic automatic caption candidate and adoption'}, indent=2))
    return {'glyphHeights': heights, 'visibleNewlineChange': True,
            'treatedAndRemainingPicturesPreserved': True, 'originalFontIdentityVerified': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--module", type=Path, required=True)
    parser.add_argument("--chrome", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--batch-count", type=int, default=0)
    parser.add_argument("--batch-seconds", type=int, default=30)
    parser.add_argument("--batch-slots", type=int, default=2)
    parser.add_argument("--replay", type=Path, help="Explicit local saved model response/evidence; no provider calls")
    parser.add_argument("--browser", action="store_true", help="Wait up to 10 minutes for isolated browser candidate adoption")
    args = parser.parse_args()
    if args.replay and (args.browser or args.batch_count):
        parser.error("replay is a separate isolated acceptance")
    if args.browser and args.batch_count:
        parser.error("browser adoption and batch measurement are separate fixtures")
    if not 0 <= args.batch_count <= 50 or args.batch_slots not in (1, 2) or not 3 <= args.batch_seconds <= 60 or args.batch_seconds % 3:
        parser.error("batch count 0–50, slots 1/2, seconds 3–60 divisible by 3")
    root = Path(__file__).resolve().parents[4]
    from batch_measurement import validate_fixture_targets
    validate_fixture_targets(os.environ["CONTENT_PRODUCTION_TEST_DATABASE_URL"],
                             os.environ["CONTENT_PRODUCTION_TEST_REDIS_URL"])
    # Probe the published host port, not the temporary init server's Unix socket.
    for attempt in range(20):
        try:
            conn = psycopg2.connect(os.environ["CONTENT_PRODUCTION_TEST_DATABASE_URL"], connect_timeout=2)
            conn.close()
            break
        except psycopg2.OperationalError:
            if attempt == 19:
                raise RuntimeError("isolated PostgreSQL did not become ready") from None
            time.sleep(0.5)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=not bool(args.batch_count))
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(args.source.resolve())], check=True, capture_output=True, text=True)
    if float(json.loads(probe.stdout)["format"]["duration"]) < (args.batch_seconds if args.batch_count else 3):
        raise ValueError("source is shorter than the requested fixture duration")
    with tempfile.TemporaryDirectory(prefix="aios-production-e2e-") as folder:
        private = Path(folder)
        cert, key = private / "cert.pem", private / "key.pem"
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", str(key), "-out", str(cert), "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:FALSE"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        key.chmod(0o600)
        access, secret = "isolated-fixture", secrets.token_hex(24)
        fixture_source = private / "source.mp4"
        shutil.copyfile(args.source.resolve(), fixture_source)
        picture_source = private / "picture.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=blue:size=640x360:rate=30:duration=3", "-f", "lavfi", "-i", "sine=frequency=950:sample_rate=48000:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ac", "2", "-shortest", str(picture_source)], check=True, timeout=30)
        server, counts = start_store(private, fixture_source, cert, key, access, secret, {"picture.mp4": picture_source})
        # Bucket 127 and a pre-qualified 127.0.0.1 endpoint exercise the unchanged virtual-host signer.
        env = {name: os.environ[name] for name in ("PATH", "HOME", "LANG", "CONTENT_PRODUCTION_TEST_DATABASE_URL", "CONTENT_PRODUCTION_TEST_REDIS_URL") if name in os.environ}
        env.update({"DATABASE_URL": env["CONTENT_PRODUCTION_TEST_DATABASE_URL"],
                    "PYTHONPATH": str(root / "etl/groland_postgres/scripts"), "CONTENT_PRODUCTION_ENABLED": "true", "CONTENT_PRODUCTION_SHOT_EXTRACTION_ENABLED": "true", "CONTENT_PRODUCTION_RUNS_ENABLED": "true",
                    "CREATIVE_CRAFT_PRODUCTION_DIR": str(args.module.resolve()), "CONTENT_PRODUCTION_WORK_DIR": str(private),
                    "PRODUCER_HEADLESS_SHELL_PATH": str(args.chrome.resolve()),
                    "CONTENT_PRODUCTION_TEST_PYTHON": str(root / "etl/groland_postgres/.venv/bin/python"),
                    "CONTENT_PRODUCTION_TEST_PICTURE": str(picture_source), "CONTENT_PRODUCTION_TEST_SOURCE": str(fixture_source), "CONTENT_PRODUCTION_TEST_OUTPUT": str(output),
                    "TOS_BUCKET": "127", "TOS_REGION": "fixture", "TOS_ENDPOINT": f"https://127.0.0.1:{server.server_port}",
                    "TOS_ACCESS_KEY_ID": access, "TOS_SECRET_ACCESS_KEY": secret, "REQUESTS_CA_BUNDLE": str(cert)})
        if args.replay:
            env["CONTENT_PRODUCTION_TEST_REPLAY"] = str(args.replay.resolve())
        if args.browser:
            env["CONTENT_PRODUCTION_TEST_BROWSER_HANDOFF"] = str(private / "browser.json")
        provider = visual_provider = None
        if not args.batch_count and not args.replay:
            provider, caption_calls = start_provider(cert, key, secret)
            env.update(AIOS_CAPTION_WORKER_MAX_CALLS='3', AIOS_CAPTION_RENDER_CANDIDATE='true',
                       AIOS_CAPTION_BASE_URL=f'https://127.0.0.1:{provider.server_port}',
                       AIOS_CAPTION_API_KEY=secret, AIOS_CAPTION_REVIEW_MODEL='isolated-caption-fixture')
            from visual_provider_fixture import start_provider as start_visual
            visual_provider, visual_calls = start_visual(cert, key, secret, output)
            env.update(AIOS_VISUAL_REVIEW_MAX_CALLS='1', AIOS_VISUAL_REVIEW_MODEL='isolated-visual-fixture',
                       AIOS_VISUAL_REVIEW_BASE_URL=f'https://127.0.0.1:{visual_provider.server_port}',
                       AIOS_VISUAL_REVIEW_API_KEY=secret)
        try:
            if args.batch_count:
                env.update(CONTENT_PRODUCTION_TEST_BATCH_COUNT=str(args.batch_count),
                           CONTENT_PRODUCTION_TEST_BATCH_SECONDS=str(args.batch_seconds),
                           CONTENT_PRODUCTION_TEST_BATCH_SLOTS=str(args.batch_slots))
            elif not args.replay:
                subprocess.run([env["CONTENT_PRODUCTION_TEST_PYTHON"], "-m", "content_production.shot_catalog",
                                "--source", str(fixture_source), "--asset-id", "11111111-1111-1111-1111-111111111111",
                                "--output", str(private / "shot-catalog")], cwd=root, env=env, check=True,
                               timeout=180, stdout=subprocess.DEVNULL)
                env["CONTENT_PRODUCTION_TEST_CATALOG"] = str(private / "shot-catalog/catalog.json")
            from batch_measurement import run_measured_fixture
            result = run_measured_fixture(root, env, output, 5700 if args.batch_count else (900 if args.browser else 240), bool(args.batch_count))
            if result:
                raise RuntimeError("HTTP/worker E2E failed; no production resources were used")
            if args.replay:
                if counts != {"get": 2, "put": 1, "rejected": 0}:
                    raise AssertionError(f"unexpected replay object counts: {counts}")
                (output / "acceptance.json").write_text(json.dumps({"status":"passed", "scope":"saved real model response replay through isolated HTTP/Worker", "requests":counts, "liveProviderCalls":0}, indent=2))
                print(json.dumps({"status":"passed", "output":str(output), "requests":counts}))
                return
            if args.batch_count:
                if counts["get"] != args.batch_count * 2 or counts["put"] != args.batch_count or counts["rejected"]:
                    raise AssertionError(f"unexpected batch object counts: {counts}")
                (output / "acceptance.json").write_text(json.dumps({"status":"passed", "scope":"local batch fixture only", "planned":args.batch_count, "requests":counts}, indent=2))
                print(json.dumps({"status":"passed", "planned":args.batch_count, "output":str(output), "requests":counts}))
                return
            if len(visual_calls) != 3:
                raise AssertionError(f'unexpected visual provider calls: {len(visual_calls)}')
            for index in range(3):
                result = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0',
                    '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json',
                    str(output / f'visual-input-{index}.mp4')], check=True, capture_output=True, text=True)
                stream = json.loads(result.stdout)['streams'][0]
                if (stream['width'], stream['height'], int(stream['nb_read_frames'])) != (720, 1280, 30):
                    raise AssertionError(f'invalid comparison input: {stream}')
            # Original caption render + candidate upload/download + adopted rerender/download.
            if caption_calls != ['review', 'revision', 'review', 'review'] * 2:
                raise AssertionError(f'unexpected caption provider phases: {caption_calls}')
            # Treated-source registration adds one PUT; Worker adds three GETs
            # (two original parents plus the derivative), one PUT and inspection GET.
            # Restoration and newline revisions each render the same three
            # sources and export one privileged inspection copy.
            # Derived-caption candidate is also uploaded and inspected once.
            if counts != {"get": 35, "put": 13, "rejected": 0}:
                raise AssertionError(f"unexpected object-service counts: {counts}")
            pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(output / "video.mp4"), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True).stdout
            samples = array("h", pcm)
            def rms(start, end):
                values = samples[int(start * 16000):int(end * 16000)]
                if not values:
                    raise AssertionError("output audio missing")
                return math.sqrt(sum((v / 32768) ** 2 for v in values) / len(values))
            audio = {"firstClipRms": rms(0.2, 0.8), "mutedClipRms": rms(1.3, 1.8)}
            if audio["firstClipRms"] <= 0.0001 or audio["mutedClipRms"] >= 0.002:
                raise AssertionError(f"original/muted audio contrast failed: {audio}")
            def samples(path):
                raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-t", "3", "-vn", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True).stdout
                return array("h", raw)
            expected_audio = samples(fixture_source)
            remix_audio = samples(output / "picture-remix-video.mp4")
            candidate_audio = samples(output / "caption-candidate-video.mp4")
            adopted_audio = samples(output / "caption-adopted-video.mp4")
            if len(candidate_audio) < 48000 or candidate_audio != adopted_audio:
                raise AssertionError("caption adoption changed decoded narration")
            audio["captionCandidateAudioPreserved"] = True
            if samples(output / "treated-video.mp4") != remix_audio:
                raise AssertionError('source treatment changed the decoded narration')
            audio['treatedNarrationPreserved'] = True
            for name in ['treated-caption-restored', 'treated-caption-wrapped', 'treated-caption-candidate']:
                if samples(output / f'{name}.mp4') != remix_audio:
                    raise AssertionError(f'caption revision changed decoded narration: {name}')
            audio['treatedCaptionNarrationPreserved'] = True
            verify_treated_picture(output, 'treated-caption-candidate')
            if min(len(expected_audio), len(remix_audio)) < 48000:
                raise AssertionError("picture remix truncated narration")
            indices = range(1600, 46400)
            energy = sum(expected_audio[i] ** 2 for i in indices) * sum(remix_audio[i] ** 2 for i in indices)
            correlation = sum(expected_audio[i] * remix_audio[i] for i in indices) / math.sqrt(energy)
            if correlation < 0.98:
                raise AssertionError("picture remix changed narration or leaked picture sound")
            pixels = subprocess.run(["ffmpeg", "-v", "error", "-i", str(output / "picture-remix-video.mp4"), "-an", "-vf", "crop=640:640,scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], check=True, capture_output=True).stdout
            if len(pixels) != 90 * 3 or any(not (pixels[i] < 30 and pixels[i+1] < 30 and pixels[i+2] > 220) for i in range(0, len(pixels), 3)):
                raise AssertionError("picture remix did not use selected visual source")
            audio["pictureRemixNarrationCorrelation"] = correlation
            treated_picture = verify_treated_picture(output)
            treated_captions = verify_restored_captions(output)
            (output / "acceptance.json").write_text(json.dumps({"status":"passed", "objectService":"loopback TLS SigV4 fixture; not cloud TOS", "requests":counts, "audio":audio, "treatedPicture":treated_picture, "treatedCaptions":treated_captions,"visualReview":{"calls":len(visual_calls),"framesPerComparison":30,"size":[720,1280],"realModel":False}}, indent=2))
            print(json.dumps({"status":"passed", "output":str(output), "requests":counts, "audio":audio}))
        finally:
            if visual_provider is not None:
                visual_provider.shutdown()
                visual_provider.server_close()
            if provider is not None:
                provider.shutdown()
                provider.server_close()
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
