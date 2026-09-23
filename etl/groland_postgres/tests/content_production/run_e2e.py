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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--module", type=Path, required=True)
    parser.add_argument("--chrome", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[4]
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
    output.mkdir(parents=True, exist_ok=True)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(args.source.resolve())], check=True, capture_output=True, text=True)
    if float(json.loads(probe.stdout)["format"]["duration"]) < 3:
        raise ValueError("source must be at least 3 seconds")
    with tempfile.TemporaryDirectory(prefix="aios-production-e2e-") as folder:
        private = Path(folder)
        cert, key = private / "cert.pem", private / "key.pem"
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", str(key), "-out", str(cert), "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:FALSE"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        key.chmod(0o600)
        access, secret = "isolated-fixture", secrets.token_hex(24)
        fixture_source = private / "source.mp4"
        shutil.copyfile(args.source.resolve(), fixture_source)
        server, counts = start_store(private, fixture_source, cert, key, access, secret)
        # Bucket 127 and a pre-qualified 127.0.0.1 endpoint exercise the unchanged virtual-host signer.
        env = {name: os.environ[name] for name in ("PATH", "HOME", "LANG", "CONTENT_PRODUCTION_TEST_DATABASE_URL", "CONTENT_PRODUCTION_TEST_REDIS_URL") if name in os.environ}
        env.update({"DATABASE_URL": env["CONTENT_PRODUCTION_TEST_DATABASE_URL"],
                    "PYTHONPATH": str(root / "etl/groland_postgres/scripts"), "CONTENT_PRODUCTION_ENABLED": "true", "CONTENT_PRODUCTION_SHOT_EXTRACTION_ENABLED": "true",
                    "CREATIVE_CRAFT_PRODUCTION_DIR": str(args.module.resolve()), "CONTENT_PRODUCTION_WORK_DIR": str(private),
                    "PRODUCER_HEADLESS_SHELL_PATH": str(args.chrome.resolve()),
                    "CONTENT_PRODUCTION_TEST_PYTHON": str(root / "etl/groland_postgres/.venv/bin/python"),
                    "CONTENT_PRODUCTION_TEST_SOURCE": str(fixture_source), "CONTENT_PRODUCTION_TEST_OUTPUT": str(output),
                    "TOS_BUCKET": "127", "TOS_REGION": "fixture", "TOS_ENDPOINT": f"https://127.0.0.1:{server.server_port}",
                    "TOS_ACCESS_KEY_ID": access, "TOS_SECRET_ACCESS_KEY": secret, "REQUESTS_CA_BUNDLE": str(cert)})
        try:
            subprocess.run([env["CONTENT_PRODUCTION_TEST_PYTHON"], "-m", "content_production.shot_catalog",
                            "--source", str(fixture_source), "--asset-id", "11111111-1111-1111-1111-111111111111",
                            "--output", str(private / "shot-catalog")], cwd=root, env=env, check=True,
                           timeout=180, stdout=subprocess.DEVNULL)
            env["CONTENT_PRODUCTION_TEST_CATALOG"] = str(private / "shot-catalog/catalog.json")
            result = subprocess.run(["bash", "scripts/backend-rust/cargo-with-cache.sh", "test", "real_http_worker_render_and_signed_delivery", "--", "--ignored", "--nocapture"], cwd=root, env=env, timeout=240)
            if result.returncode:
                raise RuntimeError("HTTP/worker E2E failed; no production resources were used")
            if counts["get"] < 4 or counts["put"] != 1 or counts["rejected"]:
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
            (output / "acceptance.json").write_text(json.dumps({"status":"passed", "objectService":"loopback TLS SigV4 fixture; not cloud TOS", "requests":counts, "audio":audio}, indent=2))
            print(json.dumps({"status":"passed", "output":str(output), "requests":counts, "audio":audio}))
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
