from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from marketing_content_assets.performance_diagnostics import (  # noqa: E402
  CANONICAL_ACTION_TYPES,
  LIVE_OBJECTIVE,
  PRODUCT_OBJECTIVE,
  build_performance_diagnosis,
)


def product_metrics(**overrides: object) -> dict[str, object]:
  metrics: dict[str, object] = {
    "objective": PRODUCT_OBJECTIVE,
    "total_impressions": 5000,
    "total_clicks": 180,
    "total_cost": 800,
    "ctr": 0.036,
    "cvr": 0.06,
    "pay_roi": 2.2,
    "refund_rate_1h": 0.02,
    "net_gmv_settlement_rate": 0.9,
  }
  metrics.update(overrides)
  return metrics


def live_metrics(**overrides: object) -> dict[str, object]:
  metrics: dict[str, object] = {
    "objective": LIVE_OBJECTIVE,
    "total_impressions": 6000,
    "total_clicks": 220,
    "total_cost": 900,
    "ctr": 0.036,
    "video_complete_play_rate": 0.22,
    "play_rate_5s": 0.48,
    "play_rate_10s": 0.42,
    "pay_roi": 1.8,
    "refund_rate_1h": 0.03,
  }
  metrics.update(overrides)
  return metrics


def live_acceptance(**overrides: object) -> dict[str, object]:
  acceptance: dict[str, object] = {
    "acceptance_quality_status": "ok",
    "product_click_rate_user": 0.14,
    "watch_to_pay_rate_user": 0.028,
    "click_to_pay_rate_user": 0.09,
  }
  acceptance.update(overrides)
  return acceptance


def product_card_acceptance(**overrides: object) -> dict[str, object]:
  acceptance: dict[str, object] = {
    "level": "product_day_aligned",
    "confidence": "medium",
    "source": "ods.douyin_trade_sale_card_detail_raw",
  }
  acceptance.update(overrides)
  return acceptance


class MarketingContentPerformanceDiagnosticsTest(unittest.TestCase):
  def assertCanonicalActions(self, diagnosis: dict[str, object]) -> None:
    actions = diagnosis.get("next_actions")
    self.assertIsInstance(actions, list)
    for action in actions:
      self.assertIsInstance(action, dict)
      self.assertIn(action.get("action_type"), CANONICAL_ACTION_TYPES)
      self.assertTrue(action.get("evidence_refs"))

  def test_product_low_ctr_routes_to_rewrite_hook(self) -> None:
    diagnosis = build_performance_diagnosis(product_metrics(ctr=0.006))

    self.assertEqual(diagnosis["problem_stage"], "creative_click_weak")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "rewrite_hook")
    self.assertCanonicalActions(diagnosis)

  def test_product_high_ctr_low_cvr_routes_to_offer_work(self) -> None:
    diagnosis = build_performance_diagnosis(
      product_metrics(cvr=0.008),
      product_card_acceptance=product_card_acceptance(),
    )

    self.assertEqual(diagnosis["problem_stage"], "product_conversion_weak")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "strengthen_selling_point")
    self.assertTrue(diagnosis["has_product_card_acceptance"])
    self.assertCanonicalActions(diagnosis)

  def test_product_low_cvr_without_card_bridge_routes_to_product_card_check(self) -> None:
    diagnosis = build_performance_diagnosis(product_metrics(cvr=0.008))

    self.assertEqual(diagnosis["problem_stage"], "product_conversion_weak")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "check_product_card")
    self.assertFalse(diagnosis["has_product_card_acceptance"])
    attribution = diagnosis["product_card_acceptance_attribution"]
    self.assertEqual(attribution["level"], "missing_card_acceptance")
    self.assertEqual(attribution["source"], "ods.douyin_trade_sale_card_detail_raw")
    self.assertEqual(attribution["bridge_source"], "ads.douyin_shortvideo_detail")
    self.assertIn("material_id -> product_id", attribution["required_bridge"])
    self.assertCanonicalActions(diagnosis)

  def test_product_high_roi_high_refund_routes_to_refund_risk(self) -> None:
    diagnosis = build_performance_diagnosis(product_metrics(pay_roi=3.1, refund_rate_1h=0.22))

    self.assertEqual(diagnosis["problem_stage"], "refund_risk_high")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "check_refund_expectation")
    self.assertCanonicalActions(diagnosis)

  def test_product_high_pay_roi_low_net_roi_routes_to_net_settlement(self) -> None:
    diagnosis = build_performance_diagnosis(
      product_metrics(pay_roi=3.1, net_gmv_roi=0.58, net_gmv_settlement_rate=0.9)
    )

    self.assertEqual(diagnosis["problem_stage"], "net_settlement_weak")
    self.assertEqual(diagnosis["root_cause_owner_by_data"], "fulfillment_or_after_sales")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "check_refund_expectation")
    self.assertIn("metric:net_gmv_roi", diagnosis["next_actions"][0]["evidence_refs"])
    net_roi_evidence = next(item for item in diagnosis["metric_evidence"] if item["metric"] == "net_gmv_roi")
    self.assertEqual(net_roi_evidence["judgment"], "weak")
    self.assertCanonicalActions(diagnosis)

  def test_product_high_pay_roi_low_settlement_rate_routes_to_net_settlement(self) -> None:
    diagnosis = build_performance_diagnosis(
      product_metrics(pay_roi=3.1, net_gmv_roi=1.4, net_gmv_settlement_rate=0.42)
    )

    self.assertEqual(diagnosis["problem_stage"], "net_settlement_weak")
    self.assertEqual(diagnosis["root_cause_owner_by_data"], "fulfillment_or_after_sales")
    self.assertIn("metric:net_gmv_settlement_rate", diagnosis["next_actions"][0]["evidence_refs"])
    settlement_evidence = next(
      item for item in diagnosis["metric_evidence"] if item["metric"] == "net_gmv_settlement_rate"
    )
    self.assertEqual(settlement_evidence["judgment"], "weak")
    self.assertCanonicalActions(diagnosis)

  def test_live_good_click_weak_watch_to_pay_routes_to_live_room(self) -> None:
    diagnosis = build_performance_diagnosis(
      live_metrics(),
      live_acceptance=live_acceptance(watch_to_pay_rate_user=0.006, click_to_pay_rate_user=0.09),
    )

    self.assertEqual(diagnosis["problem_stage"], "live_room_acceptance_weak")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "check_live_room_script")
    self.assertIn("metric:watch_to_pay_rate_user", diagnosis["next_actions"][0]["evidence_refs"])
    self.assertCanonicalActions(diagnosis)

  def test_live_good_click_weak_click_to_pay_routes_to_pricing_trust(self) -> None:
    diagnosis = build_performance_diagnosis(
      live_metrics(),
      live_acceptance=live_acceptance(watch_to_pay_rate_user=0.028, click_to_pay_rate_user=0.02),
    )

    self.assertEqual(diagnosis["problem_stage"], "pricing_trust_weak")
    self.assertEqual(diagnosis["root_cause_owner_by_data"], "live_room_offer")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "check_offer_price")
    self.assertIn("metric:click_to_pay_rate_user", diagnosis["next_actions"][0]["evidence_refs"])
    self.assertCanonicalActions(diagnosis)

  def test_live_good_entry_weak_product_click_routes_to_live_offer(self) -> None:
    diagnosis = build_performance_diagnosis(
      live_metrics(),
      live_acceptance=live_acceptance(product_click_rate_user=0.03),
    )

    self.assertEqual(diagnosis["problem_stage"], "live_product_offer_weak")
    self.assertEqual(diagnosis["root_cause_owner_by_data"], "live_room_offer")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "check_live_offer")
    self.assertIn("metric:product_click_rate_user", diagnosis["next_actions"][0]["evidence_refs"])
    self.assertCanonicalActions(diagnosis)

  def test_live_all_core_metrics_healthy_routes_to_scale_candidate(self) -> None:
    diagnosis = build_performance_diagnosis(
      live_metrics(pay_roi=2.4, refund_rate_1h=0.01),
      live_acceptance=live_acceptance(),
    )

    self.assertEqual(diagnosis["verdict"], "good")
    self.assertEqual(diagnosis["problem_stage"], "live_scale_candidate")
    self.assertEqual(diagnosis["root_cause_owner_by_data"], "growth")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "scale_budget")
    self.assertIn("metric:ctr", diagnosis["next_actions"][0]["evidence_refs"])
    self.assertCanonicalActions(diagnosis)

  def test_live_play_weak_routes_to_first_seconds_visual(self) -> None:
    diagnosis = build_performance_diagnosis(
      live_metrics(video_complete_play_rate=0.04, play_rate_5s=0.12),
      live_acceptance=live_acceptance(),
    )

    self.assertEqual(diagnosis["problem_stage"], "video_hook_weak")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "adjust_first_3s_visual")
    self.assertCanonicalActions(diagnosis)

  def test_insufficient_sample_degrades_to_observation(self) -> None:
    diagnosis = build_performance_diagnosis(
      product_metrics(total_impressions=200, total_clicks=8, total_cost=20)
    )

    self.assertEqual(diagnosis["verdict"], "insufficient_data")
    self.assertEqual(diagnosis["sample_gate"]["decision"], "early_signal_only")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "continue_observation")
    self.assertCanonicalActions(diagnosis)

  def test_missing_live_acceptance_keeps_attribution_limitation(self) -> None:
    diagnosis = build_performance_diagnosis(live_metrics(), live_acceptance=None)

    self.assertEqual(diagnosis["problem_stage"], "missing_live_acceptance")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "continue_observation")
    self.assertEqual(diagnosis["live_acceptance_attribution"]["level"], "account_date_environment")
    self.assertIn("不代表单 material_id", diagnosis["live_acceptance_attribution"]["limitation"])
    self.assertCanonicalActions(diagnosis)

  def test_dynamic_benchmark_context_overrides_static_threshold(self) -> None:
    diagnosis = build_performance_diagnosis(
      product_metrics(
        ctr=0.025,
        benchmarkContext={
          "status": "live_benchmark",
          "scope": "same_objective_account_30d",
          "metrics": {"ctr": {"p25": 0.03, "p50": 0.04, "p75": 0.05}},
        },
      )
    )

    self.assertEqual(diagnosis["problem_stage"], "creative_click_weak")
    self.assertEqual(diagnosis["benchmark_context"]["status"], "live_benchmark")
    ctr_evidence = next(item for item in diagnosis["metric_evidence"] if item["metric"] == "ctr")
    self.assertIn("P25", ctr_evidence["benchmark"])
    self.assertCanonicalActions(diagnosis)

  def test_insufficient_benchmark_status_is_preserved_without_fake_live_context(self) -> None:
    diagnosis = build_performance_diagnosis(
      product_metrics(
        benchmarkContext={
          "status": "insufficient_benchmark",
          "scope": "insufficient_benchmark",
          "metrics": {},
        }
      )
    )

    self.assertEqual(diagnosis["benchmark_context"]["status"], "insufficient_benchmark")
    self.assertNotEqual(diagnosis["benchmark_context"]["status"], "live_benchmark")
    self.assertCanonicalActions(diagnosis)

  def test_boost_metrics_do_not_override_overall_metrics(self) -> None:
    diagnosis = build_performance_diagnosis(
      product_metrics(
        ctr=0.004,
        boost_click_rate=0.2,
        boost_cost=10000,
        boost_pay_roi=8.8,
      )
    )

    self.assertEqual(diagnosis["problem_stage"], "creative_click_weak")
    self.assertEqual(diagnosis["next_actions"][0]["action_type"], "rewrite_hook")
    self.assertCanonicalActions(diagnosis)


if __name__ == "__main__":
  unittest.main()
