from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from marketing_content_assets.asr_client import (  # noqa: E402
  format_srt_timestamp,
  normalize_segments,
  segments_to_srt,
)


class MarketingContentAsrClientTest(unittest.TestCase):
  def test_format_srt_timestamp_uses_millisecond_component(self) -> None:
    self.assertEqual(format_srt_timestamp(2000), "00:00:02,000")
    self.assertEqual(format_srt_timestamp(5000), "00:00:05,000")

  def test_normalize_segments_converts_second_values_in_ms_fields(self) -> None:
    segments = normalize_segments(
      [
        {"index": 1, "start_ms": 0, "end_ms": 2, "text": "第一句", "confidence": 0.9},
        {"index": 2, "start_ms": 2, "end_ms": 5, "text": "第二句", "confidence": 0.9},
      ],
      duration_seconds=Decimal("40.067"),
    )

    self.assertEqual(segments[0]["start_ms"], 0)
    self.assertEqual(segments[0]["end_ms"], 2000)
    self.assertEqual(segments[1]["start_ms"], 2000)
    self.assertEqual(segments[1]["end_ms"], 5000)
    self.assertIn("00:00:02,000 --> 00:00:05,000", segments_to_srt(segments))

  def test_normalize_segments_keeps_real_millisecond_values(self) -> None:
    segments = normalize_segments(
      [
        {"index": 1, "start_ms": 0, "end_ms": 5000, "text": "第一句", "confidence": 0.9},
        {"index": 2, "start_ms": 5000, "end_ms": 11000, "text": "第二句", "confidence": 0.9},
      ],
      duration_seconds=43.8,
    )

    self.assertEqual(segments[0]["end_ms"], 5000)
    self.assertEqual(segments[1]["start_ms"], 5000)
    self.assertEqual(segments[1]["end_ms"], 11000)


if __name__ == "__main__":
  unittest.main()
