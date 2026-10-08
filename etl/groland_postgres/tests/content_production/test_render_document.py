import hashlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.render_document import render_document_local
from edit_document_fixture import fixture


class RenderDocumentTests(unittest.TestCase):
    def test_hash_pts_and_hdr_fail_before_rendering(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.mp4"
            source.write_bytes(b"synthetic bound bytes")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            for failure in ("hash", "pts", "unknown_pts", "hdr", "duration", "missing", "ambiguous"):
                with self.subTest(failure=failure):
                    document, bindings, media = fixture()
                    for asset in document["assets"]:
                        asset["sha256"] = bindings[asset["assetVersionId"]]["sha256"] = digest
                        media[asset["assetVersionId"]] = source
                    if failure == "hash":
                        document["assets"][0]["sha256"] = bindings["red-version"]["sha256"] = "0" * 64
                    stream = {"codec_type": "video", "start_time": "0", "duration": "6"}
                    if failure == "pts":
                        stream["start_time"] = "1"
                    elif failure == "unknown_pts":
                        del stream["start_time"]
                    elif failure == "hdr":
                        stream["color_transfer"] = "smpte2084"
                    elif failure == "duration":
                        stream["duration"] = "1"
                    streams = [] if failure == "missing" else [stream, stream] if failure == "ambiguous" else [stream]
                    metadata = SimpleNamespace(stdout=json.dumps({"streams": streams, "format": {}}))
                    with patch("content_production.render_document.verify_module"), \
                            patch("content_production.render_document.subprocess.run", return_value=metadata), \
                            patch("content_production.render_document.render_spec") as render:
                        with self.assertRaises(ValueError):
                            render_document_local(Path(folder), document, bindings, media, "test", Path(folder), False, lambda: None)
                        render.assert_not_called()


if __name__ == "__main__":
    unittest.main()
