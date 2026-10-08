"""Framework remix on AI MediaKit multi-track-edit: routing, timeline, idempotent submit, receipt."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from content_production import remix_mediakit as rm  # noqa: E402
from content_production.mediakit_client import MediaKitError  # noqa: E402

SNAPSHOT = {"aspect": "portrait", "outputProfile": "hd_1080_v1", "editDocument": None,
            "assets": [{"assetId": "a-1", "objectKey": "raw/a.mp4", "sha256": "a" * 64},
                       {"assetId": "b-2", "objectKey": "raw/b.mp4", "sha256": "b" * 64}],
            "clips": [{"assetId": "a-1", "startMs": 0, "endMs": 38333, "volume": 1, "caption": ""},
                      {"assetId": "b-2", "startMs": 1000, "endMs": 123667, "volume": 0.5, "caption": ""}]}
LINK = {"task_type": "framework_remix"}
JOB = {"job_id": "job-1", "revision": 3, "preview": False, "claim_token": "claim-1", "snapshot": SNAPSHOT}


class RoutingAndTimelineTests(unittest.TestCase):
    def test_applies_only_to_caption_free_framework_remix_when_switched_on(self):
        with patch.dict(os.environ, {rm.ENGINE_ENV: "mediakit"}):
            self.assertTrue(rm.applies(JOB, LINK))
            self.assertFalse(rm.applies(JOB, None))
            self.assertFalse(rm.applies(JOB, {"task_type": "picture_remix"}))
            self.assertFalse(rm.applies({**JOB, "snapshot": {**SNAPSHOT, "editDocument": {}}}, LINK))
            self.assertFalse(rm.applies({**JOB, "snapshot": {**SNAPSHOT, "derivedAssets": [{"x": 1}]}}, LINK))
            captioned = {**SNAPSHOT, "clips": [{**SNAPSHOT["clips"][0], "caption": "字幕"}]}
            self.assertFalse(rm.applies({**JOB, "snapshot": captioned}, LINK))
        with patch.dict(os.environ, {rm.ENGINE_ENV: ""}):
            self.assertFalse(rm.applies(JOB, LINK))  # default stays on the renderer
        with patch.dict(os.environ, {rm.ENGINE_ENV: "cloud"}), self.assertRaises(ValueError):
            rm.applies(JOB, LINK)

    def test_timeline_frames_round_the_millisecond_timeline_once(self):
        self.assertEqual(rm.timeline_ms(SNAPSHOT), 38333 + 122667)
        self.assertEqual(rm.timeline_frames(SNAPSHOT), round(161000 * 30 / 1000))

    def test_contain_box_is_centred_even_and_aspect_preserving(self):
        target = {"width": 1080, "height": 1920}
        self.assertEqual(rm.contain_box(720, 1280, target),
                         {"type": "transform", "pos_x": 0, "pos_y": 0, "width": 1080, "height": 1920})
        box = rm.contain_box(1920, 1080, target)
        self.assertEqual((box["width"], box["height"], box["pos_x"]), (1080, 608, 0))
        self.assertEqual(box["pos_y"], (1920 - 608) // 2)

    def test_build_timeline_places_trimmed_clips_back_to_back(self):
        timeline = rm.build_timeline(SNAPSHOT, {"a-1": "https://a", "b-2": "https://b"},
                                     {"a-1": (1080, 1920), "b-2": (720, 1280)}, {"width": 1080, "height": 1920})
        first, second = timeline["track"][0]
        self.assertEqual(first["target_time"], [0, 38333])
        self.assertEqual(second["target_time"], [38333, 161000])
        self.assertEqual(second["extra"][0], {"type": "trim", "start_time": 1000, "end_time": 123667})
        self.assertNotIn("a_volume", [e["type"] for e in first["extra"]])
        self.assertIn({"type": "a_volume", "volume": 0.5}, second["extra"])
        self.assertEqual(timeline["canvas"], {"width": 1080, "height": 1920, "background_color": "#000000FF"})
        self.assertEqual(timeline["output"]["fps"], 30)
        too_short = {**SNAPSHOT, "clips": [{**SNAPSHOT["clips"][0], "endMs": 20}]}
        with self.assertRaises(ValueError):
            rm.build_timeline(too_short, {"a-1": "u"}, {"a-1": (1080, 1920)}, {"width": 1080, "height": 1920})

    def test_client_token_is_per_execution(self):
        token = rm.client_token(JOB)
        self.assertEqual(token, rm.client_token(dict(JOB)))
        self.assertNotEqual(token, rm.client_token({**JOB, "claim_token": "claim-2"}))
        self.assertLessEqual(len(token), 64)


class FakeKit:
    def __init__(self, submit_errors=(), states=(), video=None):
        self.submit_errors, self.states, self.video = list(submit_errors), list(states), video
        self.bodies, self.queries = [], 0

    def submit_tool(self, tool, body):
        self.bodies.append((tool, json.dumps(body, sort_keys=True)))
        if self.submit_errors:
            raise self.submit_errors.pop(0)
        return "amk-tool-multi-track-edit-1"

    def task(self, task_id):
        self.queries += 1
        if self.states and isinstance(self.states[0], Exception):
            raise self.states.pop(0)
        return self.states.pop(0) if self.states else {"status": "completed",
                                                       "result": {"video_url": "https://x/v.mp4", "duration": 161.0}}

    def fetch(self, url, target, check, max_bytes):
        shutil.copyfile(self.video, target)
        return target.stat().st_size


class SubmitAndWaitTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(rm.time, "sleep")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_transport_failures_retry_the_identical_body(self):
        kit = FakeKit(submit_errors=[MediaKitError("MediaKit transport failed; inspect saved task state")])
        self.assertEqual(rm.submit(kit, {"client_token": "t", "track": []}, lambda: None), "amk-tool-multi-track-edit-1")
        self.assertEqual(len(kit.bodies), 2)
        self.assertEqual(kit.bodies[0], kit.bodies[1])

    def test_rejections_are_not_retried(self):
        kit = FakeKit(submit_errors=[MediaKitError("MediaKit rejected the request (InvalidParameter)")])
        with self.assertRaisesRegex(MediaKitError, "InvalidParameter"):
            rm.submit(kit, {"client_token": "t"}, lambda: None)
        self.assertEqual(len(kit.bodies), 1)

    def test_wait_reports_failure_and_timeout(self):
        kit = FakeKit(states=[{"status": "running"}, {"status": "failed", "errorCode": "InputInvalid"}])
        with self.assertRaisesRegex(MediaKitError, "云端合成失败（failed InputInvalid）"):
            rm.wait(kit, "task", lambda: None, 600)
        clock = iter([0, 0, 10_000])
        with patch.object(rm.time, "monotonic", lambda: next(clock)), self.assertRaisesRegex(TimeoutError, "云端合成超时"):
            rm.wait(FakeKit(states=[{"status": "running"}] * 3), "task", lambda: None, 600)


class PollRetryTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(rm.time, "sleep")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_transient_poll_failures_are_retried(self):
        blip = MediaKitError("MediaKit transport failed; inspect saved task state")
        kit = FakeKit(states=[blip, MediaKitError("MediaKit HTTP 502"), {"status": "running"}])
        self.assertEqual(rm.wait(kit, "task-7", lambda: None, 600)["video_url"], "https://x/v.mp4")
        self.assertEqual(kit.queries, 4)

    def test_persistent_or_permanent_poll_failures_name_the_task(self):
        blips = [MediaKitError("MediaKit transport failed; inspect saved task state")] * rm.READ_ATTEMPTS
        with self.assertRaisesRegex(MediaKitError, "云端任务 task-7"):
            rm.wait(FakeKit(states=list(blips)), "task-7", lambda: None, 600)
        kit = FakeKit(states=[MediaKitError("MediaKit HTTP 403")])
        with self.assertRaisesRegex(MediaKitError, "HTTP 403（云端任务 task-7）"):
            rm.wait(kit, "task-7", lambda: None, 600)
        self.assertEqual(kit.queries, 1)


class FakeStorage:
    def presign_get_url(self, key, ttl):
        return f"https://tos.invalid/{key}?X-Amz-Signature=secret"


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg required")
class RenderTests(unittest.TestCase):
    def test_render_returns_an_inspectable_receipt_without_signed_urls(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            media = {}
            for name, size in (("a-1", "1080x1920"), ("b-2", "720x1280")):
                media[name] = work / f"{name}.mp4"
                subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"testsrc=size={size}:rate=30:duration=1",
                                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(media[name])], check=True)
            output = work / "cloud.mp4"
            shutil.copyfile(media["a-1"], output)
            kit = FakeKit(video=output)
            probed, real_probe = [], rm.probe

            def local_probe(url, work_dir, lock_fd=None):  # stands in for ffprobe over the presigned URL
                probed.append(url)
                name = url.split("/")[-1].split(".")[0].split("?")[0]
                return real_probe(media[{"a": "a-1", "b": "b-2"}[name]], work_dir)
            with patch.object(rm.time, "sleep"), patch.object(rm, "probe", local_probe):
                video, receipt = rm.render(JOB, FakeStorage(), work, False, lambda: None, kit=kit)
            self.assertEqual(len(probed), 2)
            self.assertTrue(all(url.startswith("https://tos.invalid/raw/") for url in probed))
            self.assertEqual(receipt["engine"], rm.ENGINE)
            self.assertEqual(receipt["status"], "completed")
            self.assertIs(receipt["preview"], False)
            self.assertEqual(receipt["output"]["sha256"], hashlib.sha256(video.read_bytes()).hexdigest())
            self.assertEqual(receipt["assets"], [{"id": "aa1", "sha256": "a" * 64}, {"id": "ab2", "sha256": "b" * 64}])
            self.assertEqual(receipt["mediakit"]["expectedFrames"], rm.timeline_frames(SNAPSHOT))
            self.assertNotIn("Signature", json.dumps(receipt))
            submitted = json.loads(kit.bodies[0][1])
            self.assertEqual(submitted["client_token"], rm.client_token(JOB))
            self.assertIn("Signature=secret", submitted["track"][0][0]["source"])
            self.assertEqual(submitted["track"][0][1]["extra"][1]["width"], 1080)

    def render_once(self, kit, resume=None):
        """Renders JOB with probes stubbed to 1080x1920; returns (receipt, error)."""
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            with patch.object(rm.time, "sleep"), \
                    patch.object(rm, "source_size", lambda url, work_dir, lock_fd=None: (1080, 1920)):
                try:
                    return rm.render(JOB, FakeStorage(), work, False, lambda: None, kit=kit, resume=resume)[1], None
                except Exception as error:  # noqa: BLE001 - asserted by the caller
                    return None, error

    def test_a_failed_attempt_reuses_its_completed_cloud_task_instead_of_paying_again(self):
        with tempfile.NamedTemporaryFile(suffix=".mp4") as clip:
            Path(clip.name).write_bytes(b"video")
            failing = FakeKit(states=[MediaKitError("MediaKit HTTP 403")])
            _, error = self.render_once(failing)
            attempt = error.mediakit_attempt
            self.assertEqual(attempt["taskId"], "amk-tool-multi-track-edit-1")
            self.assertEqual(len(attempt["timelineSha256"]), 64)
            retry = FakeKit(video=Path(clip.name))
            receipt, error = self.render_once(retry, resume=attempt)
            self.assertIsNone(error)
            self.assertEqual(retry.bodies, [], "no second synthesis is submitted")
            self.assertTrue(receipt["mediakit"]["reusedTask"])
            # Another timeline (or a failed earlier task) is never reused.
            other = FakeKit(video=Path(clip.name))
            self.render_once(other, resume={**attempt, "timelineSha256": "0" * 64})
            self.assertEqual(len(other.bodies), 1)
            dead = FakeKit(states=[{"status": "failed"}], video=Path(clip.name))
            self.render_once(dead, resume=attempt)
            self.assertEqual(len(dead.bodies), 1)

    def test_render_refuses_timelines_over_the_cost_cap(self):
        with patch.dict(os.environ, {"CONTENT_PRODUCTION_MEDIAKIT_MAX_SECONDS": "60"}), \
                self.assertRaisesRegex(ValueError, "时长上限"):
            rm.render(JOB, FakeStorage(), Path("."), False, lambda: None, kit=FakeKit())


if __name__ == "__main__":
    unittest.main()
