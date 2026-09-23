from __future__ import annotations

import json
import sys
import types
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.modules.setdefault(
  "requests",
  types.SimpleNamespace(Session=lambda: None),
)

from marketing_content_assets.ark_responses import (  # noqa: E402
  ArkResponsesClient,
  CANONICAL_CONTENT_ASSET_ACTION_TYPES,
  CONTENT_ASSET_SCORE_KEYS,
  build_content_asset_analysis_prompt,
  content_asset_analysis_json_schema,
  normalize_content_asset_analysis_contract,
  normalized_score,
  parse_analysis_json,
  validate_content_asset_analysis_contract,
)


class MarketingContentArkResponsesContractTest(unittest.TestCase):
  def test_brand_resolver_uses_narrow_bounded_strict_profile(self) -> None:
    captured = {}
    client = object.__new__(ArkResponsesClient)
    client.config = types.SimpleNamespace(
      model="brand-model",
      preview_profile=types.SimpleNamespace(fps=3.0, max_output_tokens=8192),
    )

    def fake_post(payload):
      captured.update(payload)
      return {
        "id": "resp-brand-1",
        "usage": {"total_tokens": 123},
        "output_text": json.dumps({
          "brand": "OKCS",
          "status": "recognized",
          "confidence": 0.99,
          "primarySource": "visual",
          "evidence": [{
            "source": "frame",
            "kind": "package_logo",
            "text": "OKCS",
            "timeRange": "00:24-00:31",
          }],
          "alternatives": [],
        }, ensure_ascii=False),
      }

    client._post = fake_post
    result = client.resolve_video_brand(
      "https://fixture.invalid/video.mp4",
      asset_context={"videoTitle": "黄黑皮闭眼冲"},
    )

    video_input = captured["input"][0]["content"][0]
    prompt_input = captured["input"][0]["content"][1]
    self.assertEqual(1.0, video_input["fps"])
    self.assertEqual(1200, captured["max_output_tokens"])
    self.assertEqual({"type": "disabled"}, captured["thinking"])
    self.assertEqual(0, captured["temperature"])
    self.assertFalse(captured["store"])
    self.assertTrue(captured["text"]["format"]["strict"])
    self.assertIn("不得因为染发", prompt_input["text"])
    self.assertEqual("OKCS", result.analysis["brand"])
    self.assertEqual("brand_resolution_fast", result.request_settings["analysis_profile"])
    self.assertEqual("resp-brand-1", result.response_id)

  def test_schema_requires_v21_fusion_contract(self) -> None:
    schema = content_asset_analysis_json_schema()

    self.assertEqual(schema["properties"]["analysis_schema_version"]["enum"], ["2.1"])
    self.assertIn("diagnosis_mode", schema["required"])
    self.assertEqual(
      set(schema["properties"]["diagnosis_mode"]["enum"]),
      {"data_content_fusion", "data_only", "content_only", "insufficient_data"},
    )
    for key in (
      "primary_decision",
      "current_ai_analysis",
      "diagnosis_boundary",
      "performance_diagnosis",
      "content_diagnosis",
      "fusion_diagnosis",
      "evidence_ledger",
      "contradictions",
      "scores",
      "next_actions",
      "live_acceptance_attribution",
    ):
      self.assertIn(key, schema["required"])

  def test_scores_and_actions_are_canonical(self) -> None:
    schema = content_asset_analysis_json_schema()
    scores_schema = schema["properties"]["scores"]
    actions_schema = schema["properties"]["next_actions"]["items"]

    self.assertEqual(tuple(scores_schema["required"]), CONTENT_ASSET_SCORE_KEYS)
    self.assertEqual(
      set(actions_schema["properties"]["action_type"]["enum"]),
      set(CANONICAL_CONTENT_ASSET_ACTION_TYPES),
    )
    self.assertEqual(
      tuple(CANONICAL_CONTENT_ASSET_ACTION_TYPES),
      (
        "rewrite_hook",
        "adjust_first_3s_visual",
        "strengthen_selling_point",
        "add_price_anchor",
        "add_trust_proof",
        "make_cta_explicit",
        "align_video_to_product_page",
        "align_video_to_live_room_offer",
        "adjust_targeting",
        "check_product_card",
        "check_live_room_script",
        "check_live_offer",
        "check_offer_price",
        "check_refund_expectation",
        "make_variant",
        "pause_or_reduce_budget",
        "scale_budget",
        "continue_observation",
      ),
    )
    for key in (
      "owner",
      "action_type",
      "problem_stage",
      "priority",
      "expected_metric_lift",
      "metric_target",
      "evidence_refs",
    ):
      self.assertIn(key, actions_schema["required"])

  def test_parse_analysis_json_repairs_extra_closing_bracket(self) -> None:
    payload = (
      '{"content_diagnosis":{"content_evidence":[{"id":"content:hook"}]}]},'
      '"fusion_diagnosis":{"good_points":[]}}'
    )

    parsed = parse_analysis_json(payload)

    self.assertEqual(parsed["content_diagnosis"]["content_evidence"][0]["id"], "content:hook")
    self.assertEqual(parsed["fusion_diagnosis"]["good_points"], [])

  def test_parse_analysis_json_repairs_literal_newline_inside_string(self) -> None:
    payload = '{"summary":"第一行\n第二行","next_actions":[]}'

    parsed = parse_analysis_json(payload)

    self.assertEqual(parsed["summary"], "第一行\n第二行")

  def test_parse_analysis_json_repairs_truncated_string_and_closers(self) -> None:
    payload = '{"summary":"结尾被截断'

    parsed = parse_analysis_json(payload)

    self.assertEqual(parsed["summary"], "结尾被截断")

  def test_parse_analysis_json_ignores_tail_after_complete_object(self) -> None:
    payload = '{"summary":"完整对象"}\n说明：后续文本 {不是 JSON}'

    parsed = parse_analysis_json(payload)

    self.assertEqual(parsed["summary"], "完整对象")

  def test_prompt_enforces_degraded_modes_and_attribution_boundaries(self) -> None:
    prompt = build_content_asset_analysis_prompt({
      "assetId": "asset-test",
      "performanceSnapshot": None,
      "performanceDiagnosis": None,
      "transcript": None,
    })

    self.assertIn("缺 performanceSnapshot / performanceDiagnosis", prompt)
    self.assertIn("diagnosis_mode 必须写 content_only", prompt)
    self.assertIn("diagnosis_mode 必须写 data_only", prompt)
    self.assertIn("diagnosis_mode 必须写 insufficient_data", prompt)
    self.assertIn("primary_decision 只能写 scale / observe / recut / pause / insufficient", prompt)
    self.assertIn("content_understanding 必须固定输出 7 段", prompt)
    self.assertIn("diagnosis_boundary 必须说明本次是数据 x 内容融合、仅内容、仅数据还是证据不足", prompt)
    self.assertIn("boost_* / legacy_boost_* 只作为追投解释口径，禁止与 overall_* 相加", prompt)
    self.assertIn("不能写成单素材精确成交归因", prompt)
    self.assertIn("constraints 视为高优先级边界", prompt)

  def test_schema_requires_structured_video_understanding_fields(self) -> None:
    schema = content_asset_analysis_json_schema()
    properties = schema["properties"]
    platform_fit = properties["platform_fit"]
    current_ai_analysis = properties["current_ai_analysis"]
    content_understanding = current_ai_analysis["properties"]["content_understanding"]
    diagnosis_boundary = properties["diagnosis_boundary"]
    video_understanding = properties["video_understanding"]
    content_diagnosis = properties["content_diagnosis"]
    fusion_diagnosis = properties["fusion_diagnosis"]

    self.assertIn("first_3s_assessment", schema["required"])
    self.assertIn("timeline", schema["required"])
    self.assertIn("selling_points", schema["required"])
    self.assertIn("risk_flags", schema["required"])
    self.assertIn("primary_decision", schema["required"])
    self.assertIn("current_ai_analysis", schema["required"])
    self.assertIn("diagnosis_boundary", schema["required"])
    self.assertEqual(
      set(properties["primary_decision"]["enum"]),
      {"scale", "observe", "recut", "pause", "insufficient"},
    )
    for key in (
      "what_it_says",
      "content_structure",
      "core_selling_points",
      "visual_rhythm",
      "speech_and_emotion",
      "user_comprehension_barrier",
      "reusable_content_assets",
    ):
      self.assertIn(key, content_understanding["required"])
    self.assertIn("mode", diagnosis_boundary["required"])
    self.assertEqual(
      set(diagnosis_boundary["properties"]["mode"]["enum"]),
      {"data_content_fusion", "content_only", "data_only", "insufficient_data"},
    )
    self.assertIn("video_understanding", schema["required"])
    for key in (
      "hook",
      "timeline",
      "visual",
      "script",
      "product_cart_fit",
      "live_room_fit",
      "risk_flags",
    ):
      self.assertIn(key, video_understanding["required"])
    self.assertIn("product_cart", platform_fit["required"])
    self.assertIn("live_room", platform_fit["required"])
    for key in (
      "hook_assessment",
      "cta_assessment",
      "product_cart_fit",
      "live_room_fit",
      "risk_assessment",
      "content_evidence",
    ):
      self.assertIn(key, content_diagnosis["required"])
    for key in (
      "good_points",
      "bad_points",
      "primary_problem_stage",
      "secondary_problem_stages",
      "final_root_cause_owner",
      "why",
      "metric_evidence",
      "content_evidence",
      "contradictions",
      "live_acceptance_attribution",
      "confidence",
    ):
      self.assertIn(key, fusion_diagnosis["required"])
    fusion_good_points = fusion_diagnosis["properties"]["good_points"]["items"]
    self.assertEqual(fusion_good_points["required"], ["text", "evidence_refs"])

  def test_prompt_names_cta_cart_live_room_and_risk_diagnostics(self) -> None:
    prompt = build_content_asset_analysis_prompt({
      "assetId": "asset-test",
      "performanceSnapshot": {"deliveryMode": "qianchuan_all_domain"},
      "performanceDiagnosis": {"evidence_ledger": [{"id": "metric:ctr"}]},
      "transcript": {"scriptText": "进直播间领券，点击小黄车。"},
    })

    for phrase in (
      "前三秒",
      "行动引导",
      "商品卡/挂车成交承接",
      "直播间利益点",
      "风险",
      "good_points",
      "bad_points",
      "evidence_ledger",
    ):
      self.assertIn(phrase, prompt)

  def test_fusion_overall_score_is_normalized_for_asset_score(self) -> None:
    self.assertEqual(normalized_score({"scores": {"fusion_overall_score": 87}}), 8.7)
    self.assertEqual(normalized_score({"scores": {"fusion_overall_score": 8.6}}), 8.6)

  def test_contract_validator_requires_evidence_bound_fusion_points_and_action_stage(self) -> None:
    analysis = {
      "analysis_schema_version": "2.1",
      "diagnosis_mode": "data_content_fusion",
      "fusion_diagnosis": {
        "final_verdict": "weak",
        "metric_evidence": ["metric:ctr"],
        "content_evidence": ["content:hook"],
        "good_points": [{"text": "钩子清楚", "evidence_refs": ["content:hook"]}],
        "bad_points": [{"text": "点击弱", "evidence_refs": ["metric:ctr"]}],
      },
      "evidence_ledger": [
        {"id": "metric:ctr"},
        {"id": "content:hook"},
      ],
      "next_actions": [
        {
          "title": "重写前三秒",
          "problem_stage": "creative_click_weak",
          "expected_metric_lift": "CTR",
          "evidence_refs": ["metric:ctr", "content:hook"],
        }
      ],
    }

    validation = validate_content_asset_analysis_contract(analysis)

    self.assertEqual(validation["status"], "valid")

  def test_contract_normalizer_adds_video_understanding_and_marks_legacy_points(self) -> None:
    analysis = normalize_content_asset_analysis_contract({
      "analysis_schema_version": "2.1",
      "diagnosis_mode": "data_content_fusion",
      "first_3s_assessment": "前三秒痛点清楚",
      "timeline": [{
        "start_time": "00:00:00",
        "end_time": "00:00:03",
        "visual": "达人指向头顶",
        "audio_or_text": "发缝宽别慌",
        "purpose": "hook",
        "quality_signal": "痛点明确",
      }],
      "fusion_diagnosis": {
        "final_verdict": "average",
        "metric_evidence": ["metric:ctr"],
        "content_evidence": ["content:hook"],
        "good_points": ["痛点明确"],
        "bad_points": ["转化承接弱"],
      },
      "evidence_ledger": [{"id": "metric:ctr"}, {"id": "content:hook"}],
      "next_actions": [{
        "title": "补小黄车利益点",
        "problem_stage": "product_conversion_weak",
        "metric_target": "CVR",
        "evidence_refs": ["metric:ctr"],
      }],
    })

    self.assertIn("video_understanding", analysis)
    self.assertEqual(analysis["primary_decision"], "observe")
    self.assertIn("current_ai_analysis", analysis)
    self.assertIn("content_understanding", analysis["current_ai_analysis"])
    self.assertEqual(analysis["diagnosis_boundary"]["mode"], "data_content_fusion")
    self.assertEqual(analysis["video_understanding"]["hook"]["strength"], "strong")
    self.assertEqual(analysis["fusion_contract_validation"]["status"], "warning")
    self.assertGreater(len(analysis["fusion_contract_validation"]["warnings"]), 0)


if __name__ == "__main__":
  unittest.main()
