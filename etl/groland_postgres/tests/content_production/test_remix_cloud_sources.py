"""Cloud originals cannot fall through to Garage or bypass the rollout switch."""
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production import remix_cloud_sources as sources, remix_mediakit as rm
from test_remix_mediakit import JOB, LINK, FakeKit


class CloudSourcesTests(unittest.TestCase):
    def setUp(self):
        self.job = copy.deepcopy(JOB)
        self.job["snapshot"]["assets"][0]["objectKey"] = "cloud-video://42"

    def test_canonical_ids_only(self):
        self.assertIsNone(sources.video_id("raw/a.mp4"))
        self.assertEqual(sources.video_id("cloud-video://9223372036854775807"), 9223372036854775807)
        for key in ["cloud-video://0", "cloud-video://-1", "cloud-video://+1", "cloud-video://01",
                    "cloud-video://1?x", "cloud-video://1/", "cloud-video://9223372036854775808"]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                sources.video_id(key)

    def test_switch_and_supported_render_path_both_required(self):
        with patch.dict(os.environ, {sources.ENABLED_ENV: "false", rm.ENGINE_ENV: "mediakit"}):
            with self.assertRaises(ValueError):
                sources.require_cloud_render(self.job["snapshot"], rm.applies(self.job, LINK))
            sources.require_cloud_render(JOB["snapshot"], False)  # existing Garage renders unaffected
        with patch.dict(os.environ, {sources.ENABLED_ENV: "true", rm.ENGINE_ENV: "renderer"}):
            with self.assertRaises(ValueError):
                sources.require_cloud_render(self.job["snapshot"], rm.applies(self.job, LINK))
        with patch.dict(os.environ, {sources.ENABLED_ENV: "true", rm.ENGINE_ENV: "mediakit"}):
            sources.require_cloud_render(self.job["snapshot"], rm.applies(self.job, LINK))
            self.job["snapshot"]["clips"][0]["caption"] = "新增字幕"
            with self.assertRaises(ValueError):
                sources.require_cloud_render(self.job["snapshot"], rm.applies(self.job, LINK))

    def test_only_vendor_external_file_addresses_are_accepted(self):
        host = "fixture-sucaiwang.sucaicloud.com:9001"
        self.assertEqual(sources.external_url(host, "/素材/a.mp4"),
                         "https://" + host + "/%E7%B4%A0%E6%9D%90/a.mp4")
        for bad in ["localhost", "127.0.0.1", "fixture-sucaiwang-inner.sucaicloud.com",
                    "fixture-sucaiwang.sucaicloud.com.evil.test", "user@" + host, host + "/x"]:
            with self.subTest(host=bad), self.assertRaises(ValueError):
                sources.external_url(bad, "/a.mp4")
        for path in ["//evil.test/a", "/a?token=x", "/a#x", "/a\nb", "/a\\b"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                sources.external_url(host, path)

    def test_mixed_sources_use_external_url_and_presign_only_garage(self):
        url = sources.external_url("fixture-sucaiwang.sucaicloud.com:9001", "/private.mp4")
        storage = Mock()
        storage.presign_get_url.return_value = "https://garage.test/b?Signature=secret"
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {sources.ENABLED_ENV: "true"}), \
                patch.object(rm, "source_size", return_value=(1080, 1920)):
            work = Path(folder)
            raw = work / "result.mp4"
            raw.write_bytes(b"mock-cloud-render")
            kit = FakeKit(video=raw)
            _, receipt = rm.render(self.job, storage, work, False, lambda: None, kit=kit, cloud_urls={"a-1": url})
            storage.presign_get_url.assert_called_once_with("raw/b.mp4", rm.PRESIGN_SECONDS)
            timeline = json.loads(kit.bodies[0][1])
            self.assertEqual(timeline["track"][0][0]["source"], url)
            self.assertEqual([e["source"] for e in receipt["mediakit"]["timeline"]["track"][0]],
                             ["cloud-video-external-get", "presigned-tos-get"])
            self.assertNotIn(url, json.dumps(receipt))
            self.assertNotIn("Signature=secret", json.dumps(receipt))

    def test_missing_cloud_resolution_never_presigns_or_submits(self):
        storage, kit = Mock(), Mock()
        with patch.dict(os.environ, {sources.ENABLED_ENV: "true"}), tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "已验证"):
                rm.render(self.job, storage, Path(folder), False, lambda: None, kit=kit)
        storage.presign_get_url.assert_not_called()
        kit.submit_tool.assert_not_called()


if __name__ == "__main__":
    unittest.main()
