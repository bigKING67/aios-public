from __future__ import annotations

import unittest
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from marketing_content_assets.brand_resolution_contract import (  # noqa: E402
  BrandResolutionContractError,
  normalize_brand_resolution,
)


class BrandResolutionContractTest(unittest.TestCase):
  def test_normalizes_recognized_visual_brand(self) -> None:
    result = normalize_brand_resolution({
      "brand": "OKCS",
      "status": "recognized",
      "confidence": 0.99,
      "primarySource": "visual",
      "evidence": [
        {
          "source": "frame",
          "kind": "package_logo",
          "text": "OKCS",
          "timeRange": "00:24-00:31",
        }
      ],
      "alternatives": [],
    })

    self.assertEqual("OKCS", result["brand"])
    self.assertEqual("recognized", result["status"])
    self.assertEqual("visual", result["primarySource"])

  def test_downgrades_low_confidence_recognized_brand(self) -> None:
    result = normalize_brand_resolution({
      "brand": "SPES",
      "status": "recognized",
      "confidence": 0.72,
      "primarySource": "visual",
      "evidence": [
        {
          "source": "frame",
          "kind": "partial_ocr",
          "text": "SP...",
          "timeRange": "00:03",
        }
      ],
      "alternatives": [],
    })

    self.assertIsNone(result["brand"])
    self.assertEqual("ambiguous", result["status"])
    self.assertEqual(["SPES"], result["alternatives"])

  def test_rejects_unknown_status_with_confirmed_brand(self) -> None:
    with self.assertRaisesRegex(BrandResolutionContractError, "不得确认品牌"):
      normalize_brand_resolution({
        "brand": "OKCS",
        "status": "unknown",
        "confidence": 0.1,
        "primarySource": "visual",
        "evidence": [],
        "alternatives": [],
      })

  def test_rejects_unsupported_brand(self) -> None:
    with self.assertRaisesRegex(BrandResolutionContractError, "不支持的品牌"):
      normalize_brand_resolution({
        "brand": "其他品牌",
        "status": "recognized",
        "confidence": 0.99,
        "primarySource": "visual",
        "evidence": [
          {"source": "frame", "kind": "logo", "text": "其他品牌", "timeRange": "00:01"}
        ],
        "alternatives": [],
      })

  def test_rejects_recognized_without_evidence(self) -> None:
    with self.assertRaisesRegex(BrandResolutionContractError, "必须包含显式证据"):
      normalize_brand_resolution({
        "brand": "OKCS",
        "status": "recognized",
        "confidence": 0.99,
        "primarySource": "visual",
        "evidence": [],
        "alternatives": [],
      })


if __name__ == "__main__":
  unittest.main()
