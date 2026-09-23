from __future__ import annotations

import json
import sys
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from live_center_analysis import processor  # noqa: E402


class LiveCenterAnalysisProcessorTest(unittest.TestCase):
  def _config(self) -> processor.LiveCenterAnalysisConfig:
    return processor.LiveCenterAnalysisConfig(
      api_key="test-key",
      base_url="https://ark.example.test/responses",
      model="test-model",
      prompt_version="v4",
      timeout_seconds=30,
      max_output_tokens=1000,
      temperature=0.2,
      thinking_type="disabled",
      reasoning_effort="",
      store_response=False,
      json_schema_strict=False,
      signed_url_ttl_seconds=1800,
      max_segments=6,
      max_video_bytes=50 * 1024 * 1024,
      proxy_target_bytes=45 * 1024 * 1024,
      max_proxy_slice_seconds=180,
      max_proxy_slices_per_segment=4,
      frame_count_per_segment=3,
      asr_mode="best_effort",
      asr_max_output_tokens=12000,
      asr_video_fps=0.2,
      asr_prompt_max_chars_per_input=12,
      asr_prompt_max_segments_per_input=2,
      retry_without_video_on_token_limit=True,
      max_minute_metrics=360,
      video_fps=0.2,
    )

  def test_select_candidate_segments_keeps_oversized_inputs_for_proxy_chain(self) -> None:
    segments = [
      {"segmentIndex": 1, "fileSizeBytes": 7 * 1024 * 1024, "fileName": "small-1.mp4"},
      {"segmentIndex": 2, "fileSizeBytes": 58 * 1024 * 1024, "fileName": "large.mp4"},
      {"segmentIndex": 3, "fileSizeBytes": 144 * 1024 * 1024, "fileName": "very-large.mp4"},
      {"segmentIndex": 4, "fileSizeBytes": 2 * 1024 * 1024, "fileName": "small-2.mp4"},
    ]

    selected = processor._select_candidate_segments(
      segments,
      max_segments=3,
    )

    self.assertEqual([segment["segmentIndex"] for segment in selected], [1, 2, 3])

  def test_select_candidate_segments_sorts_by_segment_index(self) -> None:
    segments = [
      {"segmentIndex": 3, "fileName": "third.mp4"},
      {"segmentIndex": 1, "fileName": "first.mp4"},
      {"segmentIndex": 2, "fileName": "second.mp4"},
    ]

    selected = processor._select_candidate_segments(
      segments,
      max_segments=2,
    )

    self.assertEqual([segment["segmentIndex"] for segment in selected], [1, 2])

  def test_segment_slice_windows_cover_long_video_with_cap(self) -> None:
    windows = processor._segment_slice_windows(
      duration_seconds=286.534,
      max_slice_seconds=180,
      max_slices=4,
    )

    self.assertEqual(len(windows), 2)
    self.assertEqual(windows[0]["startSeconds"], 0.0)
    self.assertAlmostEqual(windows[0]["durationSeconds"], 180.0)
    self.assertAlmostEqual(windows[1]["startSeconds"], 180.0)

  def test_segment_slice_windows_sample_across_duration_when_capped(self) -> None:
    windows = processor._segment_slice_windows(
      duration_seconds=1200,
      max_slice_seconds=180,
      max_slices=3,
    )

    self.assertEqual(len(windows), 3)
    self.assertEqual(windows[0]["startSeconds"], 0.0)
    self.assertGreater(windows[1]["startSeconds"], 0.0)
    self.assertAlmostEqual(windows[-1]["startSeconds"], 1020.0)

  def test_metric_led_segment_slice_windows_prioritize_business_events(self) -> None:
    context = {
      "minuteMetrics": [
        {"minuteOffset": 0, "orderCount": 0},
        {"minuteOffset": 12, "orderCount": 1},
        {"minuteOffset": 45, "orderCount": 8},
        {"minuteOffset": 59, "orderCount": 0},
      ],
      "recording": {
        "segments": [
          {"segmentIndex": 1, "startOffsetSeconds": 0, "endOffsetSeconds": 3600},
        ]
      },
    }
    segment = {
      "segmentIndex": 1,
      "startOffsetSeconds": 0,
      "endOffsetSeconds": 3600,
      "durationSeconds": 3600,
    }

    windows = processor._metric_led_segment_slice_windows(
      segment=segment,
      context=context,
      duration_seconds=3600,
      max_slice_seconds=180,
      max_slices=4,
    )

    self.assertEqual([window["sliceReason"] for window in windows], [
      "opening_cold_start",
      "first_order_window",
      "peak_order_window",
      "closing_window",
    ])
    self.assertEqual(windows[0]["startSeconds"], 0.0)
    self.assertAlmostEqual(windows[1]["startSeconds"], 660.0)
    self.assertAlmostEqual(windows[2]["startSeconds"], 2640.0)
    self.assertAlmostEqual(windows[3]["startSeconds"], 3420.0)
    self.assertEqual(windows[2]["eventWindow"]["reason"], "peak_order_window")

  def test_metric_led_segment_slice_windows_falls_back_without_metrics(self) -> None:
    segment = {
      "segmentIndex": 1,
      "startOffsetSeconds": 0,
      "endOffsetSeconds": 1200,
      "durationSeconds": 1200,
    }

    windows = processor._metric_led_segment_slice_windows(
      segment=segment,
      context={},
      duration_seconds=1200,
      max_slice_seconds=180,
      max_slices=3,
    )

    self.assertEqual([window["startSeconds"] for window in windows], [0.0, 510.0, 1020.0])
    self.assertTrue(all(window["sliceReason"] == "fallback_even_coverage" for window in windows))

  def test_metric_led_segment_slice_windows_dedupes_same_event_window(self) -> None:
    context = {
      "minuteMetrics": [
        {"minuteOffset": 10, "orderCount": 5},
        {"minuteOffset": 20, "orderCount": 0},
      ],
      "recording": {
        "segments": [
          {"segmentIndex": 1, "startOffsetSeconds": 0, "endOffsetSeconds": 1800},
        ]
      },
    }
    segment = {
      "segmentIndex": 1,
      "startOffsetSeconds": 0,
      "endOffsetSeconds": 1800,
      "durationSeconds": 1800,
    }

    windows = processor._metric_led_segment_slice_windows(
      segment=segment,
      context=context,
      duration_seconds=1800,
      max_slice_seconds=180,
      max_slices=4,
    )

    reasons = [window["sliceReason"] for window in windows]
    self.assertTrue(any("first_order_window+peak_order_window" in reason for reason in reasons))
    self.assertEqual(len({window["startSeconds"] for window in windows}), len(windows))

  def test_metric_led_frame_timestamps_prefer_event_centers(self) -> None:
    context = {
      "minuteMetrics": [
        {"minuteOffset": 0, "orderCount": 0},
        {"minuteOffset": 12, "orderCount": 1},
        {"minuteOffset": 45, "orderCount": 8},
        {"minuteOffset": 59, "orderCount": 0},
      ],
      "recording": {
        "segments": [
          {"segmentIndex": 1, "startOffsetSeconds": 0, "endOffsetSeconds": 3600},
        ]
      },
    }
    segment = {
      "segmentIndex": 1,
      "startOffsetSeconds": 0,
      "endOffsetSeconds": 3600,
      "durationSeconds": 3600,
    }

    timestamps = processor._metric_led_frame_timestamps(
      segment=segment,
      context=context,
      duration_seconds=3600,
      frame_count=3,
    )

    self.assertEqual([item["timestampReason"] for item in timestamps], [
      "opening_cold_start",
      "first_order_window",
      "peak_order_window",
    ])
    self.assertAlmostEqual(timestamps[1]["timestampSeconds"], 750.0)
    self.assertAlmostEqual(timestamps[2]["timestampSeconds"], 2730.0)

  def test_recording_time_anchors_are_derived_from_segment_durations(self) -> None:
    recording = processor._enrich_recording_time_anchors(
      {
        "segments": [
          {"segmentIndex": 1, "durationSeconds": 120},
          {"segmentIndex": 2, "durationSeconds": 180},
        ]
      },
      {"liveStartTime": "2026-07-06T20:00:00"},
    )

    first, second = recording["segments"]

    self.assertEqual(first["startOffsetSeconds"], 0.0)
    self.assertEqual(first["endOffsetSeconds"], 120.0)
    self.assertEqual(first["timeAnchor"]["clockTimeRange"], "20:00:00-20:02:00")
    self.assertEqual(second["startOffsetSeconds"], 120.0)
    self.assertEqual(second["endOffsetSeconds"], 300.0)
    self.assertIn("20:02:00-20:05:00", second["displayTimeRange"])
    self.assertIn("第 3-5 分钟", second["displayTimeRange"])

  def test_recording_time_anchor_uses_visible_display_segment_index(self) -> None:
    recording = processor._enrich_recording_time_anchors(
      {
        "segments": [
          {"segmentIndex": 2, "displaySegmentIndex": 1, "durationSeconds": 120},
          {"segmentIndex": 4, "displaySegmentIndex": 2, "durationSeconds": 180},
        ]
      },
      {"liveStartTime": "2026-07-06T20:00:00"},
    )

    first, second = recording["segments"]

    self.assertEqual(first["segmentIndex"], 2)
    self.assertEqual(first["displaySegmentIndex"], 1)
    self.assertEqual(first["timeAnchor"]["segmentIndex"], 2)
    self.assertEqual(first["timeAnchor"]["displaySegmentIndex"], 1)
    self.assertIn("录屏 #1", first["displayTimeRange"])
    self.assertIn("录屏 #2", second["displayTimeRange"])

  def test_time_anchor_infers_segment_from_offset_only_anchor(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {"segmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "uploaded"},
            {"segmentIndex": 2, "durationSeconds": 3600, "uploadStatus": "uploaded"},
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {
        "timeAnchor": {
          "offsetStartSeconds": 3660,
          "offsetEndSeconds": 3720,
        },
      },
      context,
    )

    self.assertEqual(anchor["segmentIndex"], 2)
    self.assertEqual(anchor["displaySegmentIndex"], 2)
    self.assertEqual(anchor["segmentLabel"], "录屏 #2")
    self.assertIn("录屏 #2", anchor["displayTimeRange"])
    self.assertIn("21:01:00-21:02:00", anchor["displayTimeRange"])

  def test_time_anchor_end_only_boundary_stays_on_segment_that_ended(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {"segmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "uploaded"},
            {"segmentIndex": 2, "durationSeconds": 3600, "uploadStatus": "uploaded"},
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {
        "timeAnchor": {
          "offsetEndSeconds": 3600,
        },
      },
      context,
    )

    self.assertEqual(anchor["segmentIndex"], 1)
    self.assertEqual(anchor["displaySegmentIndex"], 1)
    self.assertEqual(anchor["segmentLabel"], "录屏 #1")
    self.assertIn("录屏 #1", anchor["displayTimeRange"])

  def test_time_anchor_replaces_generic_pending_label_when_offset_resolves(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {"segmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "uploaded"},
            {"segmentIndex": 2, "durationSeconds": 3600, "uploadStatus": "uploaded"},
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {
        "timeAnchor": {
          "displayTimeRange": "录屏待定位",
          "segmentLabel": "录屏待定位",
          "offsetStartSeconds": 3660,
          "offsetEndSeconds": 3720,
        },
      },
      context,
    )

    self.assertEqual(anchor["segmentIndex"], 2)
    self.assertEqual(anchor["displaySegmentIndex"], 2)
    self.assertEqual(anchor["segmentLabel"], "录屏 #2")
    self.assertNotIn("待定位", anchor["displayTimeRange"])
    self.assertIn("录屏 #2", anchor["displayTimeRange"])

  def test_time_anchor_resolves_display_segment_index_without_raw_segment_index(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {"segmentIndex": 2, "displaySegmentIndex": 1, "durationSeconds": 120, "uploadStatus": "uploaded"},
            {"segmentIndex": 4, "displaySegmentIndex": 2, "durationSeconds": 180, "uploadStatus": "uploaded"},
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {"timeAnchor": {"displaySegmentIndex": 2}},
      context,
    )

    self.assertEqual(anchor["segmentIndex"], 4)
    self.assertEqual(anchor["displaySegmentIndex"], 2)
    self.assertEqual(anchor["segmentLabel"], "录屏 #2")
    self.assertIn("录屏 #2", anchor["displayTimeRange"])

  def test_time_anchor_offset_ignores_skipped_segment_overlap(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {
              "segmentIndex": 1,
              "displaySegmentIndex": 1,
              "durationSeconds": 3600,
              "uploadStatus": "uploaded",
              "processingStatus": "completed",
            },
            {
              "segmentIndex": 2,
              "displaySegmentIndex": 2,
              "startOffsetSeconds": 3600,
              "durationSeconds": 3600,
              "uploadStatus": "uploaded",
              "processingStatus": "skipped",
            },
            {
              "segmentIndex": 4,
              "displaySegmentIndex": 3,
              "startOffsetSeconds": 3600,
              "durationSeconds": 3600,
              "uploadStatus": "uploaded",
              "processingStatus": "completed",
            },
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {
        "timeAnchor": {
          "offsetStartSeconds": 3660,
          "offsetEndSeconds": 3720,
        },
      },
      context,
    )

    self.assertEqual(anchor["segmentIndex"], 4)
    self.assertEqual(anchor["displaySegmentIndex"], 3)
    self.assertEqual(anchor["segmentLabel"], "录屏 #3")
    self.assertIn("录屏 #3", anchor["displayTimeRange"])

  def test_time_anchor_offset_does_not_infer_missing_upload_status_segment(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {"segmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "uploaded"},
            {"segmentIndex": 2, "durationSeconds": 3600},
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {
        "timeAnchor": {
          "displayTimeRange": "录屏 #2",
          "segmentLabel": "录屏 #2",
          "offsetStartSeconds": 3660,
          "offsetEndSeconds": 3720,
        },
      },
      context,
    )

    self.assertIsNone(anchor["segmentIndex"])
    self.assertIsNone(anchor["displaySegmentIndex"])
    self.assertEqual(anchor["segmentLabel"], "")
    self.assertIn("21:01:00-21:02:00", anchor["displayTimeRange"])
    self.assertNotIn("录屏 #2", anchor["displayTimeRange"])

  def test_time_anchor_offset_ignores_pending_upload_segment_overlap(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {
              "segmentIndex": 1,
              "displaySegmentIndex": 1,
              "durationSeconds": 3600,
              "uploadStatus": "uploaded",
              "processingStatus": "completed",
            },
            {
              "segmentIndex": 2,
              "displaySegmentIndex": 2,
              "startOffsetSeconds": 3600,
              "durationSeconds": 3600,
              "uploadStatus": "pending",
              "processingStatus": "completed",
            },
            {
              "segmentIndex": 4,
              "displaySegmentIndex": 3,
              "startOffsetSeconds": 3600,
              "durationSeconds": 3600,
              "uploadStatus": "uploaded",
              "processingStatus": "completed",
            },
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {
        "timeAnchor": {
          "offsetStartSeconds": 3660,
          "offsetEndSeconds": 3720,
        },
      },
      context,
    )

    self.assertEqual(anchor["segmentIndex"], 4)
    self.assertEqual(anchor["displaySegmentIndex"], 3)
    self.assertEqual(anchor["segmentLabel"], "录屏 #3")

  def test_time_anchor_explicit_non_playable_segment_does_not_fallback_to_other_segment(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {"segmentIndex": 1, "displaySegmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "uploaded"},
            {
              "segmentIndex": 2,
              "displaySegmentIndex": 2,
              "durationSeconds": 3600,
              "uploadStatus": "uploaded",
              "processingStatus": "skipped",
            },
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {
        "timeAnchor": {
          "segmentIndex": 2,
          "displaySegmentIndex": 2,
          "segmentLabel": "录屏 #2",
          "displayTimeRange": "录屏 #2",
        },
      },
      context,
    )

    self.assertIsNone(anchor["segmentIndex"])
    self.assertIsNone(anchor["displaySegmentIndex"])
    self.assertEqual(anchor["segmentLabel"], "")
    self.assertEqual(anchor["displayTimeRange"], "")

  def test_default_time_anchor_requires_playable_segment(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {"segmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "pending"},
            {"segmentIndex": 2, "durationSeconds": 3600, "uploadStatus": "uploaded", "processingStatus": "skipped"},
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._default_time_anchor(context)

    self.assertIsNone(anchor["segmentIndex"])
    self.assertIsNone(anchor["displaySegmentIndex"])
    self.assertEqual(anchor["displayTimeRange"], "")

  def test_time_anchor_offsets_override_stale_explicit_segment_index(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {"segmentIndex": 1, "displaySegmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "uploaded"},
            {"segmentIndex": 4, "displaySegmentIndex": 3, "durationSeconds": 3600, "uploadStatus": "uploaded"},
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {
        "timeAnchor": {
          "segmentIndex": 1,
          "displaySegmentIndex": 1,
          "segmentLabel": "录屏 #1",
          "offsetStartSeconds": 3660,
          "offsetEndSeconds": 3720,
        },
      },
      context,
    )

    self.assertEqual(anchor["segmentIndex"], 4)
    self.assertEqual(anchor["displaySegmentIndex"], 3)
    self.assertEqual(anchor["segmentLabel"], "录屏 #3")
    self.assertIn("录屏 #3", anchor["displayTimeRange"])

  def test_time_anchor_display_index_prefers_playable_duplicate_segment(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "segments": [
            {"segmentIndex": 2, "displaySegmentIndex": 2, "durationSeconds": 3600, "uploadStatus": "uploaded", "processingStatus": "skipped"},
            {"segmentIndex": 4, "displaySegmentIndex": 2, "durationSeconds": 3600, "uploadStatus": "uploaded", "processingStatus": "completed"},
          ]
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {"timeAnchor": {"displaySegmentIndex": 2}},
      context,
    )

    self.assertEqual(anchor["segmentIndex"], 4)
    self.assertEqual(anchor["displaySegmentIndex"], 2)
    self.assertEqual(anchor["segmentLabel"], "录屏 #2")

  def test_normalize_analysis_output_normalizes_offset_only_moment_anchor(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "minuteMetrics": [{"minuteOffset": 61, "orderCount": 2}],
      "recording": processor._enrich_recording_time_anchors(
        {
          "recordingId": "recording-1",
          "segments": [
            {"segmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "uploaded"},
            {"segmentIndex": 2, "durationSeconds": 3600, "uploadStatus": "uploaded"},
          ],
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
      "derivedInputs": {
        "videos": [{"segmentIndex": 2}],
        "frames": [{"segmentIndex": 2, "frameIndex": 1, "timestampSeconds": 60}],
        "asrTranscripts": [
          {
            "status": "succeeded",
            "segmentIndex": 2,
            "sliceStartSeconds": 0,
            "sliceEndSeconds": 120,
            "scriptText": "现在点一号链接拍下。",
            "transcriptText": "现在点一号链接拍下。",
            "confidence": 0.9,
          }
        ],
      },
    }
    analysis = {
      "summary": "测试摘要",
      "primaryDecision": {
        "decision": "optimize",
        "reason": "低谷分钟需要补 CTA。",
        "evidenceIds": ["metric:minute:all", "asr:1"],
        "confidence": 0.75,
      },
      "momentReviews": [
        {
          "timeAnchor": {
            "offsetStartSeconds": 3660,
            "offsetEndSeconds": 3720,
          },
          "title": "低谷分钟 CTA",
          "whatHappened": "主播补充一号链接动作。",
          "operatorRead": "该片段能直接用于复盘低谷承接。",
          "recommendedAction": "下一场保留明确商品卡动作。",
          "evidenceIds": ["asr:1", "metric:minute:all"],
        }
      ],
      "evidenceLedger": [],
    }

    normalized = processor._normalize_live_analysis_output(
      analysis,
      context=context,
      output_text=json.dumps(analysis, ensure_ascii=False),
      provider="ark",
      model="test-model",
      prompt_version="v4.4-coverage-aware-review",
      response_id="resp-offset",
      usage={},
    )

    anchor = normalized["momentReviews"][0]["timeAnchor"]
    self.assertEqual(anchor["segmentIndex"], 2)
    self.assertEqual(anchor["displaySegmentIndex"], 2)
    self.assertEqual(anchor["segmentLabel"], "录屏 #2")
    self.assertIn("录屏 #2", anchor["displayTimeRange"])

  def test_time_anchor_merges_parent_offsets_into_nested_anchor(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "recording": processor._enrich_recording_time_anchors(
        {
          "recordingId": "recording-1",
          "segments": [
            {"segmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "uploaded"},
            {"segmentIndex": 2, "durationSeconds": 3600, "uploadStatus": "uploaded"},
          ],
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
    }

    anchor = processor._time_anchor_from_any(
      {
        "offsetStartSeconds": 3660,
        "offsetEndSeconds": 3720,
        "timeAnchor": {
          "displayTimeRange": "录屏待定位",
          "segmentLabel": "录屏待定位",
        },
      },
      context,
    )

    self.assertEqual(anchor["segmentIndex"], 2)
    self.assertEqual(anchor["displaySegmentIndex"], 2)
    self.assertEqual(anchor["segmentLabel"], "录屏 #2")
    self.assertNotIn("待定位", anchor["displayTimeRange"])

  def test_normalize_analysis_output_normalizes_existing_evidence_anchor(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "minuteMetrics": [{"minuteOffset": 61, "orderCount": 2}],
      "recording": processor._enrich_recording_time_anchors(
        {
          "recordingId": "recording-1",
          "segments": [
            {"segmentIndex": 1, "durationSeconds": 3600, "uploadStatus": "uploaded"},
            {"segmentIndex": 2, "durationSeconds": 3600, "uploadStatus": "uploaded"},
          ],
        },
        {"liveStartTime": "2026-07-06T20:00:00"},
      ),
      "derivedInputs": {"asrTranscripts": []},
    }
    analysis = {
      "summary": "测试摘要",
      "primaryDecision": {"decision": "review", "reason": "测试", "evidenceIds": ["evidence:1"]},
      "momentReviews": [],
      "evidenceLedger": [
        {
          "evidenceId": "evidence:1",
          "type": "metric",
          "source": "分钟成交",
          "timeRange": "录屏待定位",
          "offsetStartSeconds": 3660,
          "offsetEndSeconds": 3720,
          "timeAnchor": {
            "displayTimeRange": "pending",
          },
          "content": "第 62 分钟出现成交。",
          "supports": "低谷后 CTA 有响应。",
        }
      ],
    }

    normalized = processor._normalize_live_analysis_output(
      analysis,
      context=context,
      output_text=json.dumps(analysis, ensure_ascii=False),
      provider="ark",
      model="test-model",
      prompt_version="v4.4-coverage-aware-review",
      response_id="resp-evidence-anchor",
      usage={},
    )

    evidence_anchor = normalized["evidenceLedger"][0]["timeAnchor"]
    self.assertEqual(evidence_anchor["segmentIndex"], 2)
    self.assertEqual(evidence_anchor["displaySegmentIndex"], 2)
    self.assertIn("录屏 #2", evidence_anchor["displayTimeRange"])
    self.assertNotIn("待定位", normalized["evidenceLedger"][0]["timeRange"])

  def test_slice_time_anchor_uses_absolute_live_offset(self) -> None:
    segment = processor._enrich_recording_time_anchors(
      {"segments": [{"segmentIndex": 2, "durationSeconds": 300}]},
      {"liveStartTime": "2026-07-06T20:00:00"},
    )["segments"][0]

    anchor = processor._segment_time_anchor(
      segment,
      slice_start_seconds=60,
      slice_end_seconds=180,
      slice_index=1,
    )

    self.assertEqual(anchor["offsetRange"], "00:01:00-00:03:00")
    self.assertEqual(anchor["clockTimeRange"], "20:01:00-20:03:00")
    self.assertEqual(anchor["segmentIndex"], 2)
    self.assertEqual(anchor["displaySegmentIndex"], 1)
    self.assertIn("录屏 #1 / slice 1", anchor["displayTimeRange"])

  def test_redacted_input_snapshot_does_not_persist_signed_urls(self) -> None:
    snapshot = processor._redacted_derived_input_snapshot({
      "videos": [
        {
          "segmentIndex": 2,
          "modelInputRole": "analysis_proxy",
          "modelObjectKey": "live-recordings/analysis/example.mp4",
          "url": "https://signed.example/video.mp4?X-Amz-Signature=secret",
        }
      ],
      "frames": [
        {
          "segmentIndex": 2,
          "modelInputRole": "frame",
          "modelObjectKey": "live-recordings/analysis/example.jpg",
          "url": "https://signed.example/frame.jpg?X-Amz-Signature=secret",
        }
      ],
      "asrTranscripts": [],
      "skipped": [],
    })

    self.assertNotIn("url", snapshot["videos"][0])
    self.assertNotIn("url", snapshot["frames"][0])
    self.assertEqual(snapshot["videos"][0]["modelInputRole"], "analysis_proxy")

  def test_redacts_signed_url_from_asr_error_message(self) -> None:
    redacted = processor._redact_sensitive(
      "failed https://signed.example/video.mp4?X-Amz-Credential=abc&X-Amz-Signature=secret",
      api_key="",
    )

    self.assertNotIn("abc", redacted)
    self.assertNotIn("secret", redacted)
    self.assertIn("X-Amz-Credential=<redacted>", redacted)
    self.assertIn("X-Amz-Signature=<redacted>", redacted)

  def test_transcribe_video_inputs_truncates_prompt_transcript_context(self) -> None:
    class FakeAsrClient:
      def transcribe_video(self, video_url: str, *, asset_context: dict) -> SimpleNamespace:
        self.video_url = video_url
        self.asset_context = asset_context
        return SimpleNamespace(
          provider="ark_video",
          model="asr-model",
          language="zh",
          confidence=0.9,
          transcript_text="一二三四五六七八九十十一十二十三",
          script_text="abcdefghijklmnop",
          segments=[
            {"index": 1, "start_ms": 0, "end_ms": 1000, "text": "segment-one-is-long", "confidence": 0.9},
            {"index": 2, "start_ms": 1000, "end_ms": 2000, "text": "segment-two-is-long", "confidence": 0.8},
            {"index": 3, "start_ms": 2000, "end_ms": 3000, "text": "segment-three", "confidence": 0.7},
          ],
          response_id="resp-asr",
          usage={"input_tokens": 1},
        )

    transcripts = processor._transcribe_video_inputs(
      asr_client=FakeAsrClient(),
      videos=[{
        "segmentIndex": 2,
        "url": "https://signed.example/video.mp4?X-Amz-Signature=secret",
        "modelInputRole": "analysis_proxy",
        "timeAnchor": {
          "displayTimeRange": "20:01:00-20:04:00｜第 2-4 分钟｜录屏 #2",
        },
      }],
      context={"session": {"sessionId": "session-1"}},
      config=self._config(),
    )

    self.assertEqual(len(transcripts), 1)
    self.assertEqual(transcripts[0]["transcriptText"], "一二三四五六七八九十十一...")
    self.assertEqual(transcripts[0]["scriptText"], "abcdefghijkl...")
    self.assertEqual(len(transcripts[0]["segments"]), 2)
    self.assertNotIn("url", transcripts[0])
    self.assertEqual(transcripts[0]["timeAnchor"]["displayTimeRange"], "20:01:00-20:04:00｜第 2-4 分钟｜录屏 #2")

  def test_required_asr_fails_when_client_is_unavailable(self) -> None:
    config = replace(self._config(), asr_mode="required")
    original_prepare = processor._prepare_segment_video_inputs

    def fake_prepare_segment_video_inputs(**kwargs: object) -> dict:
      return {
        "videos": [{
          "segmentIndex": 2,
          "url": "https://signed.example/video.mp4?X-Amz-Signature=secret",
          "modelInputRole": "analysis_proxy",
        }],
        "frames": [],
        "skipped": [],
      }

    processor._prepare_segment_video_inputs = fake_prepare_segment_video_inputs
    try:
      with self.assertRaises(processor.TranscriptError) as raised:
        processor._prepare_multimodal_inputs(
          storage=object(),
          asr_client=None,
          segments=[{"segmentIndex": 2}],
          context={"session": {"sessionId": "session-1"}},
          config=config,
          analysis_id="analysis-1",
          work_dir=Path("/tmp/live-center-analysis-test"),
        )
    finally:
      processor._prepare_segment_video_inputs = original_prepare

    self.assertIn("asr_client_not_available", str(raised.exception))

  def test_should_retry_without_video_inputs_on_multimodal_token_limit(self) -> None:
    should_retry = processor._should_retry_without_video_inputs(
      processor.ArkResponsesError(
        "Ark Responses API 调用失败 HTTP 400: Total tokens of multi-modal content and text exceed max message tokens"
      ),
      {"videos": [{"segmentIndex": 3}]},
      "l2_multimodal",
      self._config(),
    )

    self.assertTrue(should_retry)

  def test_analyze_recording_without_video_inputs_keeps_frames_and_prompt(self) -> None:
    class CaptureClient(processor.ArkLiveRecordingClient):
      def __init__(self, config: processor.LiveCenterAnalysisConfig):
        super().__init__(config)
        self.payload = None

      def _post(self, payload: dict) -> dict:
        self.payload = payload
        return {
          "id": "resp-main",
          "output_text": json.dumps({
            "summary": "测试摘要",
            "primaryDecision": {
              "decision": "review",
              "reason": "测试",
              "evidenceIds": ["frame:1"],
              "confidence": 0.6,
            },
            "timeline": [],
            "evidenceLedger": [
              {
                "evidenceId": "frame:1",
                "type": "frame",
                "source": "抽帧",
                "timeRange": "",
                "content": "测试帧",
                "supports": "测试",
                "confidence": 0.6,
              }
            ],
            "reviewTasks": [],
            "analysisSelfEval": {
              "confidence": 0.6,
              "missingEvidence": [],
              "riskFlags": [],
              "notes": "测试",
            },
            "metrics": {
              "minuteMetricCount": 0,
              "recordingSegmentCount": 0,
              "peakMinuteOffset": None,
              "peakMinuteOrderCount": None,
            },
            "recording": {
              "recordingId": "recording-1",
              "segmentCount": 1,
              "analyzedSegmentCount": 1,
            },
            "input": {
              "promptVersion": "v4",
              "evidenceSources": ["frame"],
            },
          }),
        }

    config = self._config()
    client = CaptureClient(config)
    derived_inputs = {
      "videos": [{"segmentIndex": 2, "url": "https://signed.example/video.mp4"}],
      "frames": [{"segmentIndex": 2, "url": "https://signed.example/frame.jpg"}],
      "asrTranscripts": [],
      "skipped": [],
    }

    client.analyze_recording(
      context={"session": {}, "minuteMetrics": [], "recording": {"segments": []}},
      derived_inputs=derived_inputs,
      analysis_profile="l2_multimodal",
      prompt_version="v4",
      requested_model=None,
      include_video_inputs=False,
    )

    content = client.payload["input"][0]["content"]
    self.assertNotIn("input_video", [item["type"] for item in content])
    self.assertIn("input_image", [item["type"] for item in content])
    self.assertIn("input_text", [item["type"] for item in content])

  def test_parse_live_analysis_json_accepts_control_chars_and_trailing_commas(self) -> None:
    raw_output = '''
    前置说明会被忽略
    {
      "summary": "第一行
第二行",
      "primaryDecision": {
        "decision": "review"
        "reason": "字段间漏了逗号"
      },
      "momentReviews": [
        {
          "title": "成交低谷",
          "operatorRead": "前期转化承接不足",
        },
      ],
    }
    后置说明会被忽略
    '''

    parsed = processor._parse_live_analysis_json(raw_output)

    self.assertEqual(parsed["summary"], "第一行\n第二行")
    self.assertEqual(parsed["primaryDecision"]["reason"], "字段间漏了逗号")
    self.assertEqual(parsed["momentReviews"][0]["title"], "成交低谷")

  def test_attach_derived_inputs_records_retry_request_without_signed_urls(self) -> None:
    config = self._config()
    context = {"recording": {"segments": [{"segmentIndex": 2}]}}
    derived_inputs = {
      "videos": [{"segmentIndex": 2, "url": "https://signed.example/video.mp4"}],
      "frames": [{"segmentIndex": 2, "url": "https://signed.example/frame.jpg"}],
      "asrTranscripts": [],
      "skipped": [],
    }
    main_request = processor._main_analysis_request_snapshot(
      derived_inputs,
      include_video_inputs=False,
      request_mode="frame_asr_retry_after_token_limit",
      reason="multimodal_token_limit",
    )

    processor._attach_derived_inputs_to_context(
      context,
      derived_inputs,
      config,
      main_request=main_request,
    )

    self.assertEqual(
      context["derivedInputs"]["mainAnalysisRequest"]["requestMode"],
      "frame_asr_retry_after_token_limit",
    )
    self.assertFalse(context["derivedInputs"]["mainAnalysisRequest"]["includeVideoInputs"])
    self.assertNotIn("url", context["derivedInputs"]["videos"][0])
    self.assertNotIn("url", context["derivedInputs"]["frames"][0])

  def test_build_input_snapshot_carries_main_request_without_signed_urls(self) -> None:
    config = self._config()
    derived_inputs = {
      "videos": [{"segmentIndex": 2, "url": "https://signed.example/video.mp4"}],
      "frames": [{"segmentIndex": 2, "url": "https://signed.example/frame.jpg"}],
      "asrTranscripts": [],
      "skipped": [],
    }
    main_request = processor._main_analysis_request_snapshot(
      derived_inputs,
      include_video_inputs=False,
      request_mode="frame_asr_retry_after_token_limit",
      reason="multimodal_token_limit",
    )
    context = {
      "session": {"sessionId": "session-1", "liveStartTime": "2026-07-06T20:00:00"},
      "recording": {
        "recordingId": "recording-1",
        "status": "uploaded",
        "segments": [{
          "segmentId": "segment-2",
          "segmentIndex": 2,
          "displaySegmentIndex": 1,
          "fileName": "part-1.mp4",
          "durationSeconds": 3600,
          "startOffsetSeconds": 0,
          "endOffsetSeconds": 3600,
          "uploadStatus": "uploaded",
          "processingStatus": "completed",
          "objectKey": "raw/private/object-key.mp4",
        }],
      },
      "minuteMetrics": [],
    }
    processor._attach_derived_inputs_to_context(
      context,
      derived_inputs,
      config,
      main_request=main_request,
    )

    snapshot = processor._build_input_snapshot(
      context,
      analysis_profile="l2_multimodal",
      prompt_version="v4",
      model="test-model",
      signed_url_ttl_seconds=1800,
      selected_segment_count=1,
      derived_inputs=derived_inputs,
      max_video_bytes=50 * 1024 * 1024,
    )

    self.assertEqual(
      snapshot["derivedInputs"]["mainAnalysisRequest"]["requestMode"],
      "frame_asr_retry_after_token_limit",
    )
    self.assertFalse(snapshot["derivedInputs"]["mainAnalysisRequest"]["includeVideoInputs"])
    self.assertEqual(snapshot["session"]["liveStartTime"], "2026-07-06T20:00:00")
    self.assertEqual(snapshot["recording"]["recordingId"], "recording-1")
    self.assertEqual(snapshot["recording"]["segments"][0]["segmentId"], "segment-2")
    self.assertEqual(snapshot["recording"]["segments"][0]["displaySegmentIndex"], 1)
    self.assertEqual(snapshot["recording"]["segments"][0]["startOffsetSeconds"], 0)
    self.assertEqual(snapshot["recording"]["segments"][0]["endOffsetSeconds"], 3600)
    self.assertEqual(snapshot["recording"]["segments"][0]["uploadStatus"], "uploaded")
    self.assertEqual(snapshot["recording"]["segments"][0]["processingStatus"], "completed")
    self.assertFalse(_contains_key(snapshot, "objectKey"))
    self.assertFalse(_contains_key(snapshot, "url"))

  def test_prompt_schema_requires_script_diagnosis_and_action_outputs(self) -> None:
    schema = processor.live_recording_analysis_json_schema()
    prompt = processor._build_live_recording_prompt(
      {"session": {}, "minuteMetrics": [], "recording": {"segments": []}},
      prompt_version="v4",
    )

    self.assertIn("executiveReview", schema["required"])
    self.assertIn("momentReviews", schema["required"])
    self.assertIn("speechScript", schema["required"])
    self.assertIn("scriptReview", schema["required"])
    self.assertIn("conversionDiagnosis", schema["required"])
    self.assertIn("operatorScorecard", schema["required"])
    self.assertIn("actionPlan", schema["required"])
    self.assertIn("executiveReview", schema["properties"])
    self.assertIn("momentReviews", schema["properties"])
    self.assertIn("speechScript", schema["properties"])
    self.assertIn("scriptReview", schema["properties"])
    self.assertIn("conversionDiagnosis", schema["properties"])
    self.assertIn("operatorScorecard", schema["properties"])
    self.assertIn("actionPlan", schema["properties"])
    self.assertIn(
      "displaySegmentIndex",
      schema["properties"]["momentReviews"]["items"]["properties"]["timeAnchor"]["properties"],
    )
    self.assertIn("信息去重", prompt)
    self.assertIn("不同字段要承担不同任务", prompt)
    self.assertIn("Coverage-aware", prompt)
    self.assertIn("证据闭合", prompt)
    self.assertIn("expectedImpact", prompt)
    self.assertIn("evidenceCoverage", schema["properties"]["analysisSelfEval"]["properties"])
    self.assertIn("claimScope", schema["properties"]["analysisSelfEval"]["required"])

  def test_metric_led_segment_selection_prioritizes_peak_window(self) -> None:
    segments = [
      {"segmentIndex": 1, "startOffsetSeconds": 0, "endOffsetSeconds": 600},
      {"segmentIndex": 2, "startOffsetSeconds": 600, "endOffsetSeconds": 1200},
      {"segmentIndex": 3, "startOffsetSeconds": 1200, "endOffsetSeconds": 1800},
      {"segmentIndex": 4, "startOffsetSeconds": 1800, "endOffsetSeconds": 2400},
    ]
    minute_metrics = [
      {"minuteOffset": 2, "orderCount": 0},
      {"minuteOffset": 22, "orderCount": 3},
    ]

    selected = processor._select_candidate_segments(
      segments,
      max_segments=2,
      minute_metrics=minute_metrics,
    )

    self.assertEqual([segment["segmentIndex"] for segment in selected], [1, 3])

  def test_sampling_plan_records_actual_event_input_coverage(self) -> None:
    context = {
      "minuteMetrics": [
        {"minuteOffset": 0, "orderCount": 0},
        {"minuteOffset": 12, "orderCount": 1},
        {"minuteOffset": 45, "orderCount": 8},
        {"minuteOffset": 59, "orderCount": 0},
      ],
      "recording": {
        "segments": [
          {"segmentIndex": 1, "startOffsetSeconds": 0, "endOffsetSeconds": 3600},
        ]
      },
    }
    derived_inputs = {
      "videos": [
        {
          "modelInputRole": "analysis_proxy_slice",
          "segmentIndex": 1,
          "sliceIndex": 3,
          "offsetStartSeconds": 2640,
          "offsetEndSeconds": 2820,
        }
      ],
      "frames": [
        {
          "modelInputRole": "frame",
          "segmentIndex": 1,
          "frameIndex": 2,
          "offsetStartSeconds": 2730,
          "offsetEndSeconds": 2730,
        }
      ],
      "asrTranscripts": [
        {
          "status": "succeeded",
          "modelInputRole": "analysis_proxy_slice",
          "segmentIndex": 1,
          "sliceIndex": 3,
          "offsetStartSeconds": 2640,
          "offsetEndSeconds": 2820,
        }
      ],
    }

    plan = processor._build_sampling_plan(
      context,
      selected_segments=[{"segmentIndex": 1}],
      derived_inputs=derived_inputs,
      main_request={"requestMode": "video_frame_asr"},
    )

    peak_window = next(
      item for item in plan["selectedWindows"]
      if item["reason"] == "peak_order_window"
    )
    self.assertEqual(peak_window["offsetStartSeconds"], 2520.0)
    self.assertEqual(peak_window["offsetEndSeconds"], 2940.0)
    self.assertEqual(peak_window["sliceIndexes"], [3])
    self.assertEqual(peak_window["frameIndexes"], [2])
    self.assertEqual(peak_window["selectedInputRoles"], [
      "analysis_proxy_slice",
      "asr:analysis_proxy_slice",
      "frame",
    ])

  def test_normalize_analysis_output_derives_script_diagnosis_and_actions(self) -> None:
    context = {
      "minuteMetrics": [{"minuteOffset": 12, "orderCount": 3}],
      "recording": {
        "recordingId": "recording-1",
        "segments": [{"segmentIndex": 2, "uploadStatus": "uploaded", "processingStatus": "completed"}],
      },
      "derivedInputs": {
        "videoCount": 1,
        "frameCount": 2,
        "asrTranscriptCount": 1,
        "mainAnalysisRequest": {"requestMode": "video_frame_asr"},
        "asrTranscripts": [
          {
            "status": "succeeded",
            "segmentIndex": 2,
            "sliceStartSeconds": 0,
            "sliceEndSeconds": 180,
            "timeAnchor": {
              "displayTimeRange": "20:00:00-20:03:00｜第 1-3 分钟｜录屏 #2 / slice 1",
              "offsetStartSeconds": 0,
              "offsetEndSeconds": 180,
              "segmentIndex": 2,
              "sliceIndex": 1,
            },
            "scriptText": "主播反复强调一号链接拍一发二。",
            "transcriptText": "大家看一号链接，拍一发二。",
            "confidence": 0.9,
          }
        ],
      },
    }
    analysis = {
      "summary": "测试摘要",
      "primaryDecision": {
        "decision": "optimize",
        "reason": "转化偏低，需要优化话术承接。",
        "evidenceIds": ["asr:1", "metric:minute:all"],
        "confidence": 0.8,
      },
      "evidenceLedger": [],
      "reviewTasks": [
        {
          "taskId": "review:1",
          "priority": "high",
          "title": "复核话术与成交峰值",
          "reason": "确认一号链接讲解是否带来成交；当前仅9张随机抽帧，需人工复核。",
          "evidenceIds": ["asr:1"],
        }
      ],
    }

    normalized = processor._normalize_live_analysis_output(
      analysis,
      context=context,
      output_text=json.dumps(analysis, ensure_ascii=False),
      provider="ark",
      model="test-model",
      prompt_version="v4",
      response_id="resp-main",
      usage={},
    )

    self.assertEqual(normalized["speechScript"][0]["scriptText"], "主播反复强调一号链接拍一发二。")
    self.assertEqual(normalized["speechScript"][0]["timeRange"], "20:00:00-20:03:00｜第 1-3 分钟｜录屏 #2 / slice 1")
    self.assertEqual(normalized["executiveReview"]["verdict"], "optimize")
    self.assertEqual(normalized["scriptReview"][0]["quote"], "主播反复强调一号链接拍一发二。")
    self.assertEqual(normalized["scriptReview"][0]["issue"], "福利力度有了，但稀缺性和截止动作不足，难以形成当场转化压力。")
    self.assertEqual(
      [item["dimension"] for item in normalized["operatorScorecard"]],
      list(processor.OPERATOR_SCORECARD_DIMENSIONS),
    )
    self.assertNotEqual(normalized["operatorScorecard"][0]["fix"], normalized["operatorScorecard"][1]["fix"])
    self.assertEqual(normalized["conversionDiagnosis"]["verdict"], "optimize")
    self.assertEqual(normalized["actionPlan"][0]["priority"], "high")
    self.assertNotIn("抽帧", json.dumps(normalized["reviewTasks"], ensure_ascii=False))
    self.assertIn("画面证据", json.dumps(normalized["reviewTasks"], ensure_ascii=False))

  def test_normalize_analysis_output_enforces_coverage_and_evidence_closure(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "minuteMetrics": [{"minuteOffset": index, "orderCount": 1 if index == 12 else 0} for index in range(20)],
      "recording": {
        "recordingId": "recording-1",
        "segments": [{"segmentIndex": 2, "durationSeconds": 1800}],
      },
      "derivedInputs": {
        "videos": [{"segmentIndex": 2}],
        "frames": [{"segmentIndex": 2, "frameIndex": 1, "timestampSeconds": 90}],
        "asrTranscripts": [
          {
            "status": "succeeded",
            "segmentIndex": 2,
            "sliceStartSeconds": 0,
            "sliceEndSeconds": 180,
            "scriptText": "大家看一号链接，拍一发二。",
            "transcriptText": "大家看一号链接，拍一发二。",
            "confidence": 0.9,
          }
        ],
        "mainAnalysisRequest": {
          "requestMode": "text_only_recovery_after_worker_timeout",
          "includeVideoInputs": False,
          "availableVideoInputCount": 1,
          "videoInputCount": 0,
          "selectedSegmentIndexes": [2],
        },
      },
    }
    analysis = {
      "summary": "本场全程高度重复，90%以上内容重复。",
      "primaryDecision": {
        "decision": "optimize",
        "reason": "需要优化话术。",
        "evidenceIds": ["asr:1", "frame:all", "metric:minute:all"],
        "confidence": 0.8,
      },
      "evidenceLedger": [],
      "actionPlan": [
        {
          "priority": "high",
          "ownerRole": "主播",
          "due": "下一场开播前",
          "action": "重写一号链接话术。",
          "reason": "采样口播重复。",
          "expectedImpact": "提升点击率30%。",
          "evidenceIds": ["asr:1", "frame:all"],
        }
      ],
      "scriptReview": [
        {
          "quote": "全程没有库存了，ASR听一下。",
          "intent": "催单",
          "operatorComment": "全程没有商品信任背书。",
          "rewriteSuggestion": "补充库存紧迫性和利益点。",
          "evidenceIds": ["asr:1"],
        }
      ],
      "reviewTasks": [],
      "analysisSelfEval": {"confidence": 0.95},
    }

    normalized = processor._normalize_live_analysis_output(
      analysis,
      context=context,
      output_text=json.dumps(analysis, ensure_ascii=False),
      provider="ark",
      model="test-model",
      prompt_version="v4.4-coverage-aware-review",
      response_id="resp-main",
      usage={},
    )

    ledger_ids = {
      item["evidenceId"]
      for item in normalized["evidenceLedger"]
      if isinstance(item, dict)
    }
    referenced_ids = set(processor._collect_referenced_evidence_ids(normalized))

    self.assertTrue({"asr:1", "frame:all", "metric:minute:all"}.issubset(ledger_ids))
    self.assertTrue(referenced_ids.issubset(ledger_ids))
    self.assertIn("采样口播片段显示", normalized["summary"])
    self.assertNotIn("90%", normalized["summary"])
    self.assertNotIn("30%", json.dumps(normalized["actionPlan"], ensure_ascii=False))
    self.assertEqual(normalized["scriptReview"][0]["quote"], "全程没有库存了，ASR听一下。")
    self.assertNotIn("全程没有", normalized["scriptReview"][0]["operatorComment"])
    self.assertEqual(normalized["analysisSelfEval"]["claimScope"], "sampled_asr_plus_full_minute_metrics")
    self.assertNotIn("claimScope", normalized["analysisSelfEval"]["evidenceCoverage"])
    self.assertIn("full_asr", normalized["analysisSelfEval"]["missingEvidence"])
    self.assertTrue(normalized["analysisSelfEval"]["requiresHumanReview"])
    self.assertTrue(normalized["analysisSelfEval"]["needsMultimodal"])
    self.assertEqual(normalized["analysisQualityGate"]["grade"], "review_required")
    self.assertFalse(normalized["analysisQualityGate"]["safeToUseAsFinalReview"])
    self.assertGreaterEqual(normalized["analysisQualityGate"]["evidenceHealth"]["unresolvedEvidenceCount"], 0)
    self.assertTrue(
      any(item["code"] == "sampled_asr_scope" for item in normalized["analysisQualityGate"]["warnings"])
    )

  def test_normalize_analysis_output_builds_ready_quality_gate_for_complete_review(self) -> None:
    context = {
      "session": {"liveStartTime": "2026-07-06T20:00:00"},
      "minuteMetrics": [{"minuteOffset": index, "orderCount": 2 if index in {2, 4, 6} else 0} for index in range(8)],
      "recording": {
        "recordingId": "recording-1",
        "segments": [{"segmentIndex": 1, "displaySegmentIndex": 1, "durationSeconds": 600}],
      },
      "derivedInputs": {
        "videoCount": 1,
        "frameCount": 1,
        "videos": [{"segmentIndex": 1}],
        "frames": [{"segmentIndex": 1, "frameIndex": 1, "timestampSeconds": 60}],
        "asrTranscripts": [
          {
            "status": "succeeded",
            "segmentIndex": 1,
            "sliceStartSeconds": 30,
            "sliceEndSeconds": 120,
            "scriptText": "敏感肌宝宝看一号链接，今天到手价更划算，拍下就送旅行装。",
            "transcriptText": "敏感肌宝宝看一号链接，今天到手价更划算，拍下就送旅行装。",
            "confidence": 0.92,
          },
          {
            "status": "succeeded",
            "segmentIndex": 1,
            "sliceStartSeconds": 180,
            "sliceEndSeconds": 260,
            "scriptText": "库存不多，适合干敏肌囤一套，现在点商品卡一号链接。",
            "transcriptText": "库存不多，适合干敏肌囤一套，现在点商品卡一号链接。",
            "confidence": 0.9,
          },
        ],
        "mainAnalysisRequest": {
          "requestMode": "video_frame_asr",
          "includeVideoInputs": True,
          "availableVideoInputCount": 1,
          "videoInputCount": 1,
          "selectedSegmentIndexes": [1],
        },
      },
    }
    action_template = {
      "priority": "high",
      "ownerRole": "主播",
      "due": "下一场开播前",
      "reason": "峰值前的话术把人群、福利和商品卡动作讲完整，可复制到低谷分钟。",
      "expectedImpact": "预期改善成交响应和商品卡点击，具体幅度用下一场分钟数据验证。",
      "evidenceIds": ["asr:1", "metric:minute:all"],
    }
    analysis = {
      "summary": "峰值成交来自人群点名、福利锚点和明确商品卡动作，下一场应复制到低谷分钟。",
      "executiveReview": {
        "verdict": "optimize",
        "oneSentenceConclusion": "峰值前的话术结构可复制。",
        "whyNow": "成交曲线和口播证据能互相支撑。",
        "confidence": 0.86,
        "evidenceIds": ["asr:1", "metric:minute:all"],
      },
      "primaryDecision": {
        "decision": "optimize",
        "reason": "复用峰值前的话术结构。",
        "evidenceIds": ["asr:1", "metric:minute:all"],
        "confidence": 0.86,
      },
      "momentReviews": [
        {
          "timeAnchor": {
            "displayTimeRange": "20:00:30-20:02:00｜第 1-2 分钟｜录屏 #1",
            "offsetStartSeconds": 30,
            "offsetEndSeconds": 120,
            "segmentIndex": 1,
          },
          "title": "峰值前完整 CTA",
          "whatHappened": "主播点名敏感肌人群并给出一号链接动作。",
          "operatorRead": "人群、福利和动作完整，能解释随后成交响应。",
          "recommendedAction": "把这套结构复制到低谷分钟。",
          "evidenceIds": ["asr:1", "metric:minute:all"],
        }
      ],
      "evidenceLedger": [],
      "scriptReview": [
        {
          "quote": "敏感肌宝宝看一号链接，今天到手价更划算，拍下就送旅行装。",
          "intent": "讲福利价格",
          "operatorComment": "这句同时点名人群、价格福利和商品卡动作。",
          "rewriteSuggestion": "保留人群点名，再加一句库存和截止时间。",
          "evidenceIds": ["asr:1"],
        }
      ],
      "operatorScorecard": [
        {
          "dimension": dimension,
          "score": 86,
          "status": "good",
          "diagnosis": f"{dimension}有证据支撑。",
          "fix": f"继续强化{dimension}动作。",
          "evidenceIds": ["asr:1", "metric:minute:all"],
        }
        for dimension in processor.OPERATOR_SCORECARD_DIMENSIONS
      ],
      "actionPlan": [
        {**action_template, "action": "把峰值前 30 秒话术整理成主播口播卡。"},
        {**action_template, "ownerRole": "场控", "action": "在低谷分钟提示主播补充商品卡点击动作。"},
        {**action_template, "ownerRole": "复盘运营", "due": "本场复盘前", "action": "对比峰值前后 3 分钟订单响应并沉淀话术模板。"},
      ],
      "reviewTasks": [],
      "analysisSelfEval": {"confidence": 0.88},
    }

    normalized = processor._normalize_live_analysis_output(
      analysis,
      context=context,
      output_text=json.dumps(analysis, ensure_ascii=False),
      provider="ark",
      model="test-model",
      prompt_version="v4.4-coverage-aware-review",
      response_id="resp-ready",
      usage={},
    )

    gate = normalized["analysisQualityGate"]
    self.assertEqual(gate["grade"], "ready")
    self.assertTrue(gate["safeToUseAsFinalReview"])
    self.assertGreaterEqual(gate["score"], 85)
    self.assertEqual(gate["blockingIssues"], [])
    self.assertEqual(gate["evidenceHealth"]["scorecardDimensionCount"], len(processor.OPERATOR_SCORECARD_DIMENSIONS))
    self.assertGreaterEqual(gate["evidenceHealth"]["asrEvidenceCount"], 1)
    self.assertGreaterEqual(gate["evidenceHealth"]["metricEvidenceCount"], 1)
    self.assertGreaterEqual(gate["evidenceHealth"]["visualEvidenceCount"], 1)

  def test_normalize_analysis_output_deduplicates_repeated_review_items(self) -> None:
    context = {
      "minuteMetrics": [],
      "recording": {"recordingId": "recording-1", "segments": []},
      "derivedInputs": {},
    }
    analysis = {
      "summary": "测试摘要",
      "primaryDecision": {
        "decision": "review",
        "reason": "测试",
        "evidenceIds": ["metric:minute:all"],
        "confidence": 0.5,
      },
      "evidenceLedger": [
        {
          "evidenceId": "metric:minute:all",
          "type": "metric",
          "source": "分钟指标",
          "timeRange": "",
          "content": "订单为空",
          "supports": "转化偏弱",
          "confidence": 0.5,
        }
      ],
      "momentReviews": [
        {
          "timeAnchor": {
            "displayTimeRange": "20:00:00-20:01:00｜第 1 分钟｜录屏 #1",
            "offsetRange": "00:00:00-00:01:00",
            "clockTimeRange": "20:00:00-20:01:00",
            "minuteRangeLabel": "第 1 分钟",
            "segmentLabel": "录屏 #1",
            "segmentIndex": 1,
            "sliceIndex": None,
          },
          "title": "重复片段",
          "whatHappened": "同一条观察",
          "operatorRead": "同一条判断",
          "scriptQuote": "",
          "metricSignal": "同一条指标",
          "visualSignal": "同一条画面",
          "recommendedAction": "同一条动作",
          "evidenceIds": ["metric:minute:all"],
          "confidence": 0.5,
        },
        {
          "timeAnchor": {
            "displayTimeRange": "20:00:00-20:01:00｜第 1 分钟｜录屏 #1",
            "offsetRange": "00:00:00-00:01:00",
            "clockTimeRange": "20:00:00-20:01:00",
            "minuteRangeLabel": "第 1 分钟",
            "segmentLabel": "录屏 #1",
            "segmentIndex": 1,
            "sliceIndex": None,
          },
          "title": "重复片段",
          "whatHappened": "同一条观察",
          "operatorRead": "同一条判断",
          "scriptQuote": "",
          "metricSignal": "同一条指标",
          "visualSignal": "同一条画面",
          "recommendedAction": "同一条动作",
          "evidenceIds": ["metric:minute:all"],
          "confidence": 0.5,
        },
      ],
      "actionPlan": [
        {
          "priority": "high",
          "ownerRole": "运营",
          "action": "复核同一事项",
          "reason": "同一原因",
          "expectedImpact": "同一影响",
          "evidenceIds": ["metric:minute:all"],
        },
        {
          "priority": "high",
          "ownerRole": "运营",
          "action": "复核同一事项",
          "reason": "同一原因",
          "expectedImpact": "同一影响",
          "evidenceIds": ["metric:minute:all"],
        },
      ],
    }

    normalized = processor._normalize_live_analysis_output(
      analysis,
      context=context,
      output_text=json.dumps(analysis, ensure_ascii=False),
      provider="ark",
      model="test-model",
      prompt_version="v4",
      response_id="resp-main",
      usage={},
    )

    self.assertEqual(len(normalized["momentReviews"]), 1)
    self.assertEqual(len(normalized["actionPlan"]), 3)
    self.assertEqual(
      sum(1 for item in normalized["actionPlan"] if item.get("action") == "复核同一事项"),
      1,
    )


def _contains_key(value: object, key: str) -> bool:
  if isinstance(value, dict):
    return any(item_key == key or _contains_key(item_value, key) for item_key, item_value in value.items())
  if isinstance(value, list):
    return any(_contains_key(item, key) for item in value)
  return False


if __name__ == "__main__":
  unittest.main()
