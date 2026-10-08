"""Concurrent fixture uploads must retain every distinct object's bytes."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import unittest

from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
from object_fixture import start_store


@unittest.skipUnless(shutil.which("openssl"), "requires openssl for loopback TLS fixture")
class ObjectFixtureTests(unittest.TestCase):
    def test_concurrent_distinct_uploads_are_not_overwritten(self):
        with tempfile.TemporaryDirectory(prefix="aios-object-fixture-") as folder:
            root = Path(folder)
            cert, key = root / "cert.pem", root / "key.pem"
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                            "-keyout", str(key), "-out", str(cert), "-subj", "/CN=127.0.0.1",
                            "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:FALSE"],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            key.chmod(0o600)
            source = root / "source.mp4"
            source.write_bytes(b"fixture")
            access, secret = "isolated-fixture", secrets.token_hex(24)
            server, counts = start_store(root, source, cert, key, access, secret)
            config = TosStorageConfig(access, secret, f"https://127.0.0.1:{server.server_port}", "fixture", "127")
            def one(index):
                client = TosStorageClient(config)
                client.session.trust_env = False
                client.session.verify = str(cert)
                payload = bytes([index]) * 65536
                file = root / f"input-{index}.mp4"
                file.write_bytes(payload)
                name = f"production/batch/job-{index}/video.mp4"
                try:
                    client.upload_file(name, file, "video/mp4")
                    response = client.session.get(client.presign_get_url(name), timeout=10)
                    response.raise_for_status()
                    self.assertEqual(response.content, payload)
                finally:
                    client.session.close()
            try:
                with ThreadPoolExecutor(max_workers=4) as pool:
                    list(pool.map(one, range(16)))
                self.assertEqual(counts, {"get":16, "put":16, "rejected":0})
                self.assertEqual(len(list(root.glob("output-*.mp4"))), 16)
            finally:
                server.shutdown()
                server.server_close()
