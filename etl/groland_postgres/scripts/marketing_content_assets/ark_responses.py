from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional

import requests

from .ark_json_parser import parse_analysis_json as _parse_analysis_json
from .brand_resolution_provider import request_video_brand_resolution


DEFAULT_ARK_RESPONSES_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/responses"
DEFAULT_ARK_CONTENT_ANALYSIS_MODEL = "doubao-seed-2-0-lite-260428"
DEFAULT_CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION = "2.1"
DEFAULT_CONTENT_ASSET_VIDEO_UNDERSTANDING_PROMPT_VERSION = "v1"
DEFAULT_CONTENT_ASSET_FUSION_ANALYSIS_PROMPT_VERSION = "v1"
CONTENT_ASSET_SCORE_KEYS = (
  "data_performance_score",
  "content_quality_score",
  "hook_score",
  "selling_point_score",
  "conversion_support_score",
  "live_entry_score",
  "live_acceptance_score",
  "risk_score",
  "fusion_overall_score",
  "confidence",
)
CANONICAL_CONTENT_ASSET_ACTION_TYPES = (
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
)
PRIMARY_DECISION_VALUES = ("scale", "observe", "recut", "pause", "insufficient")


class ArkResponsesError(RuntimeError):
  pass


@dataclass(frozen=True)
class ArkAnalysisProfile:
  name: str
  max_output_tokens: int
  fps: float
  thinking_type: str
  reasoning_effort: str
  temperature: float
  json_schema_strict: bool
  store_response: bool

  def request_settings(self) -> Dict[str, Any]:
    settings: Dict[str, Any] = {
      "analysis_profile": self.name,
      "max_output_tokens": self.max_output_tokens,
      "fps": self.fps,
      "thinking_type": self.thinking_type,
      "temperature": self.temperature,
      "json_schema_strict": self.json_schema_strict,
      "store_response": self.store_response,
    }
    if self.reasoning_effort:
      settings["reasoning_effort"] = self.reasoning_effort
    return settings


@dataclass(frozen=True)
class ArkResponsesConfig:
  api_key: str
  base_url: str
  model: str
  analysis_schema_version: str
  video_understanding_prompt_version: str
  fusion_analysis_prompt_version: str
  timeout_seconds: int
  preview_profile: ArkAnalysisProfile
  raw_profile: ArkAnalysisProfile
  action_profile: ArkAnalysisProfile

  @classmethod
  def from_env(cls) -> "ArkResponsesConfig":
    api_key = (
      os.getenv("ARK_API_KEY")
      or os.getenv("VOLCENGINE_ARK_API_KEY")
      or os.getenv("ARK_ACCESS_TOKEN")
      or ""
    ).strip()
    if not api_key:
      raise ArkResponsesError("缺少 ARK_API_KEY，无法调用火山方舟 Responses API")
    temperature = _env_float("ARK_TEMPERATURE", 0.2)
    json_schema_strict = _env_bool("ARK_JSON_SCHEMA_STRICT", True)
    store_response = _env_bool("ARK_STORE_RESPONSE", False)
    return cls(
      api_key=api_key,
      base_url=(os.getenv("ARK_RESPONSES_BASE_URL") or DEFAULT_ARK_RESPONSES_BASE_URL).strip(),
      model=(
        os.getenv("CONTENT_ASSET_VIDEO_UNDERSTANDING_MODEL")
        or os.getenv("ARK_CONTENT_ANALYSIS_MODEL")
        or DEFAULT_ARK_CONTENT_ANALYSIS_MODEL
      ).strip(),
      analysis_schema_version=(
        os.getenv("CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION")
        or DEFAULT_CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION
      ).strip(),
      video_understanding_prompt_version=(
        os.getenv("CONTENT_ASSET_VIDEO_UNDERSTANDING_PROMPT_VERSION")
        or DEFAULT_CONTENT_ASSET_VIDEO_UNDERSTANDING_PROMPT_VERSION
      ).strip(),
      fusion_analysis_prompt_version=(
        os.getenv("CONTENT_ASSET_FUSION_ANALYSIS_PROMPT_VERSION")
        or DEFAULT_CONTENT_ASSET_FUSION_ANALYSIS_PROMPT_VERSION
      ).strip(),
      timeout_seconds=_env_int("ARK_RESPONSES_TIMEOUT_SECONDS", 300),
      preview_profile=ArkAnalysisProfile(
        name="preview_fast",
        max_output_tokens=_env_int("CONTENT_ASSET_AI_MAX_OUTPUT_TOKENS", 8192),
        fps=_env_float("ARK_VIDEO_FPS_PREVIEW", 1.0),
        thinking_type=_env_choice("ARK_THINKING_TYPE", "disabled", {"enabled", "disabled", "auto"}),
        reasoning_effort=_env_choice("ARK_REASONING_EFFORT", "", {"", "minimal", "low", "medium", "high"}),
        temperature=temperature,
        json_schema_strict=json_schema_strict,
        store_response=store_response,
      ),
      raw_profile=ArkAnalysisProfile(
        name="raw_deep",
        max_output_tokens=_env_int("CONTENT_ASSET_AI_DEEP_MAX_OUTPUT_TOKENS", 8192),
        fps=_env_float("ARK_VIDEO_FPS_RAW", 2.0),
        thinking_type=_env_choice("ARK_DEEP_THINKING_TYPE", "enabled", {"enabled", "disabled", "auto"}),
        reasoning_effort=_env_choice("ARK_DEEP_REASONING_EFFORT", "high", {"", "minimal", "low", "medium", "high"}),
        temperature=temperature,
        json_schema_strict=json_schema_strict,
        store_response=store_response,
      ),
      action_profile=ArkAnalysisProfile(
        name="action_detail",
        max_output_tokens=_env_int("CONTENT_ASSET_AI_ACTION_MAX_OUTPUT_TOKENS", 10000),
        fps=_env_float("ARK_VIDEO_FPS_ACTION", 5.0),
        thinking_type=_env_choice("ARK_ACTION_THINKING_TYPE", "enabled", {"enabled", "disabled", "auto"}),
        reasoning_effort=_env_choice("ARK_ACTION_REASONING_EFFORT", "high", {"", "minimal", "low", "medium", "high"}),
        temperature=temperature,
        json_schema_strict=json_schema_strict,
        store_response=store_response,
      ),
    )

  def analysis_profile(self, profile_name: str) -> ArkAnalysisProfile:
    normalized = (profile_name or "preview_fast").strip().lower()
    if normalized in {"preview", "preview_fast", "fast"}:
      return self.preview_profile
    if normalized in {"raw", "raw_deep", "deep"}:
      return self.raw_profile
    if normalized in {"action", "action_detail"}:
      return self.action_profile
    raise ArkResponsesError(f"未知 Ark 分析 profile: {profile_name}")


@dataclass
class ArkAnalysisResult:
  text: str
  analysis: Dict[str, Any]
  raw_response: Dict[str, Any]
  request_settings: Dict[str, Any]

  @property
  def usage(self) -> Dict[str, Any]:
    usage = self.raw_response.get("usage")
    return usage if isinstance(usage, dict) else {}

  @property
  def response_id(self) -> str:
    return str(self.raw_response.get("id") or "")


class ArkResponsesClient:
  def __init__(self, config: ArkResponsesConfig):
    self.config = config
    self.session = requests.Session()

  def analyze_video(
    self,
    video_url: str,
    *,
    asset_context: Dict[str, Any],
    analysis_profile: str = "preview_fast",
  ) -> ArkAnalysisResult:
    profile = self.config.analysis_profile(analysis_profile)
    prompt = build_content_asset_analysis_prompt(asset_context)
    video_input: Dict[str, Any] = {"type": "input_video", "video_url": video_url}
    video_input["fps"] = _bounded_fps(profile.fps)
    content: List[Dict[str, Any]] = [video_input, {"type": "input_text", "text": prompt}]
    payload = {
      "model": self.config.model,
      "input": [{"role": "user", "content": content}],
      "max_output_tokens": profile.max_output_tokens,
      "thinking": {"type": profile.thinking_type},
      "temperature": profile.temperature,
      "store": profile.store_response,
    }
    if profile.reasoning_effort and profile.thinking_type != "disabled":
      payload["reasoning"] = {"effort": profile.reasoning_effort}
    if profile.json_schema_strict:
      payload["text"] = {
        "format": {
          "type": "json_schema",
          "name": "content_asset_video_analysis",
          "strict": True,
          "schema": content_asset_analysis_json_schema(),
        }
      }
    response = self._post(payload)
    output_text = extract_output_text(response)
    analysis = parse_analysis_json(output_text)
    prompt_version = _analysis_prompt_version(
      self.config.fusion_analysis_prompt_version,
      self.config.analysis_schema_version,
    )
    analysis.setdefault("analysis_schema_version", self.config.analysis_schema_version)
    analysis.setdefault("prompt_version", prompt_version)
    analysis.setdefault("model_name", self.config.model)
    analysis = normalize_content_asset_analysis_contract(analysis)
    return ArkAnalysisResult(
      text=output_text,
      analysis=analysis,
      raw_response=response,
      request_settings={
        **profile.request_settings(),
        "model": self.config.model,
        "analysis_schema_version": self.config.analysis_schema_version,
        "video_understanding_prompt_version": self.config.video_understanding_prompt_version,
        "fusion_analysis_prompt_version": self.config.fusion_analysis_prompt_version,
        "prompt_version": prompt_version,
      },
    )

  def smoke_image(self, image_url: str, text: str = "你看见了什么？") -> ArkAnalysisResult:
    max_output_tokens = self.config.preview_profile.max_output_tokens
    payload = {
      "model": self.config.model,
      "input": [
        {
          "role": "user",
          "content": [
            {"type": "input_image", "image_url": image_url},
            {"type": "input_text", "text": text},
          ],
        }
      ],
      "max_output_tokens": min(max_output_tokens, 300),
      "thinking": {"type": "disabled"},
      "store": False,
    }
    response = self._post(payload)
    output_text = extract_output_text(response)
    return ArkAnalysisResult(text=output_text, analysis={}, raw_response=response, request_settings={})

  def resolve_video_brand(
    self,
    video_url: str,
    *,
    asset_context: Mapping[str, Any],
  ) -> ArkAnalysisResult:
    return ArkAnalysisResult(**request_video_brand_resolution(
      self._post, extract_output_text, ArkResponsesError, self.config,
      video_url, asset_context,
    ))

  def _post(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    response = self.session.post(
      self.config.base_url,
      headers={
        "Authorization": f"Bearer {self.config.api_key}",
        "Content-Type": "application/json",
      },
      data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
      timeout=self.config.timeout_seconds,
    )
    if response.status_code >= 400:
      raise ArkResponsesError(
        f"Ark Responses API 调用失败 HTTP {response.status_code}: {_redact_sensitive(response.text)[:800]}"
      )
    try:
      payload = response.json()
    except json.JSONDecodeError as error:
      raise ArkResponsesError(f"Ark Responses API 返回非 JSON: {_redact_sensitive(response.text)[:800]}") from error
    if not isinstance(payload, dict):
      raise ArkResponsesError("Ark Responses API 返回结构不是对象")
    return payload


def build_content_asset_analysis_prompt(asset_context: Dict[str, Any]) -> str:
  context_json = json.dumps(asset_context, ensure_ascii=False, indent=2)
  return f"""你是 Groland 内容素材中台的视频素材分析助手。请基于视频画面、音频、字幕/口播，以及下面的业务档案，输出可直接写入数据库的结构化 JSON。

业务档案：
{context_json}

如果业务档案中包含 transcript，请以 transcript.scriptText / transcript.segments 作为口播文案真相源；视频画面仍以 input_video 为准。若画面和口播冲突，需要在 timeline 或 risk_flags 中说明。
如果业务档案中包含 constraints，请把 constraints 视为高优先级边界：delivery_mode、objective、boost_metrics_policy、live_acceptance_policy、product_card_acceptance_policy 不能被视频观感覆盖。
如果业务档案中包含 productCardAcceptance：level=missing_card_acceptance 时，必须写明缺可信 material_id -> product_id bridge；level=product_day_aligned/product_range_aligned 时，只能把 ods.douyin_trade_sale_card_detail_raw 作为 product_id + 日期窗口 + source_level1 对齐后的商品卡承接上下文，并标明 bridge_source/bridge.method，不能输出商品卡点击、成交或 GMV 对单 material_id 的精确归因。

如果业务档案中包含 performanceSnapshot 或 performanceDiagnosis：
- 必须结合千川全域数据与视频内容判断素材好坏，不能只客观描述。
- delivery_mode 固定理解为 qianchuan_all_domain。
- objective=product_all_domain_shortvideo 时，重点判断曝光、点击、成交、ROI、净成交、结算和退款。
- objective=live_all_domain_shortvideo 时，重点判断视频钩子/留存、进直播间意图、直播间承接、商品点击、成交、退款；douyin_trade_sale_live_raw 只能作为账号+日期级直播间承接环境，不能写成单素材精确成交归因。
- boost_* / legacy_boost_* 只作为追投解释口径，禁止与 overall_* 相加。
- 结论必须包含：好在哪里、差在哪里、问题环节、责任归因、数据证据、内容证据和下一版动作。
- performanceDiagnosis 中已有 sample_gate / benchmark_context / evidence_ledger / next_actions 时，必须沿用其边界与证据引用，不要压扁成泛泛建议。
- 如果缺 performanceSnapshot / performanceDiagnosis 但仍能理解视频内容，diagnosis_mode 必须写 content_only；不允许评价投放效率、ROI 或放量潜力。
- 如果视频画面、口播或 transcript 不足以支持内容判断，但有千川表现数据，diagnosis_mode 必须写 data_only；不允许评价脚本、画面或前三秒优劣。
- 如果数据表现和视频内容两侧都不足，diagnosis_mode 必须写 insufficient_data，不要硬下放量结论。
- primary_decision 只能写 scale / observe / recut / pause / insufficient，分别对应继续放量 / 小测观察 / 重剪再测 / 暂停投放 / 证据不足。
- current_ai_analysis 是前端 AI 分析 tab 的主读片结果；content_understanding 必须固定输出 7 段，每段 1-3 句，帮助运营理解素材，不要写成 SRT 全文、逐帧流水账或模型 JSON。
- diagnosis_boundary 必须说明本次是数据 x 内容融合、仅内容、仅数据还是证据不足；content_only 不允许评价 ROI、成交、投放效率、是否值得放量或千川承接强弱。
- scores 必须输出完整多维分：数据表现、内容质量、钩子、卖点、转化承接、直播进房、直播承接、风险、综合分和置信度。
- next_actions.action_type 只能从标准动作库中选择：{", ".join(CANONICAL_CONTENT_ASSET_ACTION_TYPES)}。

只返回一个合法 JSON 对象，不要 Markdown，不要代码块，不要解释。若 API 已提供 JSON Schema，则严格遵循该 schema。
字段必须包含：
{{
  "analysis_schema_version": "2.1",
  "diagnosis_mode": "data_content_fusion/data_only/content_only/insufficient_data",
  "primary_decision": "scale/observe/recut/pause/insufficient",
  "delivery_mode": "qianchuan_all_domain",
  "objective": "product_all_domain_shortvideo/live_all_domain_shortvideo/unknown",
  "suggested_title": "12-24 个中文字符的视频标题，概括画面/口播/产品或场景，不要使用文件名或 token",
  "suggested_tags": ["3-6 个可用于素材库筛选的短标签"],
  "summary": "80 个中文字符以内的一句话素材摘要",
  "score": 0-10 的数字，代表素材可投放/可复剪综合潜力,
  "hook_type": "前三秒钩子类型，例如痛点开场/效果对比/达人背书/场景代入/产品直给/不明确",
  "first_3s_assessment": "前三秒吸引力与问题",
  "timeline": [
    {{
      "start_time": "HH:MM:SS",
      "end_time": "HH:MM:SS",
      "visual": "120 字以内概括该片段画面",
      "audio_or_text": "120 字以内摘录关键口播/字幕，不要逐字转写；没有则写空字符串",
      "purpose": "该片段在素材中的作用，例如 hook/卖点展示/信任背书/行动引导/过渡",
      "quality_signal": "该片段的优点或问题；timeline 总数最多 3 段，覆盖关键转折即可"
    }}
  ],
  "scene_tags": ["场景标签"],
  "product_tags": ["产品/卖点标签"],
  "selling_points": ["主要卖点"],
  "risk_flags": ["合规或素材风险，没有则空数组"],
  "current_ai_analysis": {{
    "content_understanding": {{
      "what_it_says": "素材讲什么：概括主角、场景、产品和用户问题，1-3 句",
      "content_structure": "内容结构：开头、铺垫、卖点展开、转化引导如何组织，1-3 句",
      "core_selling_points": "核心卖点：用户能记住的利益点和背书，1-3 句",
      "visual_rhythm": "画面与节奏：前三秒、镜头变化、信息密度、节奏问题，1-3 句",
      "speech_and_emotion": "话术与情绪：口播/字幕如何建立情绪、信任和行动意愿，1-3 句",
      "user_comprehension_barrier": "用户理解门槛：用户可能卡住、误解或不相信的地方，1-3 句",
      "reusable_content_assets": "可复用内容资产：可复剪的镜头、话术、结构或转化组件，1-3 句"
    }},
    "final_judgment": "当前 AI 分析最终判断，需与 primary_decision 对齐",
    "core_reasons": ["核心原因，优先融合内容和数据；content_only 时只写内容证据"],
    "problem_stages": ["问题环节，例如 hook_opening/selling_point_timing/conversion_guidance/live_room_acceptance_weak"],
    "next_actions": [
      {{
        "title": "动作标题",
        "action": "动作标题",
        "detail": "执行说明",
        "reason": "为什么做",
        "owner": "creative/media_buying/product_offer/live_room/live_room_offer/data_sample/data_linkage/growth/unknown",
        "action_type": "rewrite_hook",
        "problem_stage": "creative_click_weak",
        "priority": "high/medium/low",
        "expected_metric_lift": "预期影响的指标；content_only 可写待补数据验证",
        "metric_target": "预期影响的指标；content_only 可写待补数据验证",
        "evidence_refs": ["metric:ctr", "content:hook"]
      }}
    ]
  }},
  "diagnosis_boundary": {{
    "mode": "data_content_fusion/content_only/data_only/insufficient_data",
    "message": "说明本次结论使用了哪些证据，以及不能判断什么",
    "data_evidence_summary": "已使用的千川表现依据；content_only 时写空字符串",
    "data_mapping_anchor": "performance-summary/data-mapping"
  }},
  "video_understanding": {{
    "hook": {{
      "time_range": "00:00-00:03",
      "type": "痛点开场/效果对比/场景代入/直播福利/产品直给/不明确",
      "strength": "strong/medium/weak",
      "observation": "前三秒观察",
      "issue": "前三秒问题，没有则空字符串"
    }},
    "timeline": [
      {{
        "time_range": "00:00-00:03",
        "visual": "关键画面",
        "script": "关键口播/字幕",
        "business_meaning": "该片段对投放/转化的业务含义"
      }}
    ],
    "visual": {{
      "clarity": "strong/medium/weak",
      "product_visibility": "strong/medium/weak",
      "before_after_contrast": "strong/medium/weak/none",
      "trust_signal": "strong/medium/weak/none"
    }},
    "script": {{
      "pain_point_clarity": "strong/medium/weak",
      "selling_point_clarity": "strong/medium/weak",
      "price_or_offer_clarity": "strong/medium/weak/none",
      "cta_clarity": "strong/medium/weak/none"
    }},
    "product_cart_fit": {{
      "product_decision_support": "strong/medium/weak",
      "commodity_trust_signal": "strong/medium/weak"
    }},
    "live_room_fit": {{
      "entry_reason_clarity": "strong/medium/weak/none",
      "live_benefit_signal": "strong/medium/weak/none",
      "urgency_signal": "strong/medium/weak/none"
    }},
    "risk_flags": ["风险点，没有则空数组"]
  }},
  "repurpose_suggestions": ["复剪建议"],
  "platform_fit": {{
    "douyin": "适配判断",
    "xiaohongshu": "适配判断",
    "qianchuan": "千川投放适配判断",
    "product_cart": "商品卡/挂车成交承接适配判断",
    "live_room": "直播间引流承接适配判断"
  }},
  "sample_gate": {{
    "status": "ok/insufficient_sample/missing",
    "decision": "allow_directional_verdict/early_signal_only/content_only",
    "observed": {{"total_impressions": 0, "total_clicks": 0, "total_cost": 0}},
    "minimums": {{"total_impressions": 1000, "total_clicks": 30, "total_cost": 50}},
    "failed_thresholds": []
  }},
  "benchmark_context": {{
    "objective": "诊断目标",
    "scope": "objective_static_threshold/same_objective_account_30d/same_objective_global_30d/same_objective_global_90d/insufficient_benchmark/unknown",
    "status": "static_fallback/live_benchmark/insufficient_benchmark/missing",
    "window_days": "样本窗口，例如 7/30/unknown",
    "source": "阈值或 benchmark 来源",
    "sample_status": "ok/insufficient_sample/missing",
    "note": "benchmark 使用限制"
  }},
  "live_acceptance_attribution": {{
    "level": "account_date_environment/not_applicable/missing",
    "confidence": "high/medium/low",
    "source": "直播承接数据来源或空字符串",
    "limitation": "直播间成交数据为账号/日期级承接环境，不代表单 material_id 精确成交贡献"
  }},
  "product_card_acceptance_attribution": {{
    "level": "product_day_aligned/product_range_aligned/account_date_context/missing_card_acceptance/not_applicable",
    "confidence": "high/medium/low",
    "source": "ods.douyin_trade_sale_card_detail_raw 或空字符串",
    "bridge_source": "ads.douyin_shortvideo_detail 或空字符串",
    "source_grain": "shop_id + stat_date + product_id + source_level1",
    "required_bridge": "trusted material_id -> product_id",
    "limitation": "商品卡承接不是 material_id 直连；缺可信 product_id、日期窗口和 source_level1 对齐时，不能归因到单 material_id 的商品卡 GMV"
  }},
  "performance_diagnosis": {{
    "verdict": "good/needs_iteration/bad/insufficient_data",
    "problem_stage": "traffic_scale_weak/creative_click_weak/product_conversion_weak/live_entry_intent_weak/live_room_acceptance_weak/scale_candidate/unknown",
    "root_cause_owner_by_data": "creative/media_buying/product_offer/live_room/data_sample/unknown",
    "good_points": ["基于数据的优点"],
    "bad_points": ["基于数据的短板"],
    "metric_evidence": [
      {{
        "id": "metric:ctr",
        "type": "metric",
        "metric": "ctr",
        "label": "点击率",
        "value": "1.25%",
        "benchmark": ">= 1.2%",
        "benchmark_position": "good/weak",
        "judgment": "good/weak",
        "source": "dwd 或 dws 表名 / 视频理解",
        "meaning": "这条证据说明的问题"
      }}
    ]
  }},
  "content_diagnosis": {{
    "good_points": ["基于画面/脚本的优点"],
    "bad_points": ["基于画面/脚本的问题"],
    "hook_assessment": "前三秒评价",
    "cta_assessment": "行动引导是否明确，例如点击商品卡/进入直播间/领券",
    "message_match": "内容承诺与投放目标是否匹配",
    "product_cart_fit": "商品卡/挂车成交承接是否匹配",
    "live_room_fit": "直播间利益点与进房理由是否匹配",
    "risk_assessment": "夸大承诺、价格预期、退款或合规风险",
    "content_evidence": [
      {{
        "id": "content:hook",
        "type": "content",
        "metric": "hook",
        "label": "前三秒钩子",
        "value": "强/中/弱",
        "benchmark": "目标人群是否能在 3 秒内理解收益",
        "benchmark_position": "good/weak",
        "judgment": "good/weak",
        "source": "input_video/transcript",
        "meaning": "这条内容证据说明的问题"
      }}
    ]
  }},
  "fusion_diagnosis": {{
    "one_sentence_summary": "用数据和内容共同判断这条素材到底好不好",
    "final_verdict": "excellent/good/average/weak/bad/insufficient_data",
    "good_points": [
      {{"text": "数据或内容能支撑的优点", "evidence_refs": ["metric:ctr", "content:hook"]}}
    ],
    "bad_points": [
      {{"text": "数据或内容暴露的问题", "evidence_refs": ["metric:cvr", "content:cta"]}}
    ],
    "problem_stage": "最终定位环节",
    "primary_problem_stage": "最终定位的首要问题环节",
    "secondary_problem_stages": ["次要问题环节"],
    "root_cause_owner": "最终责任归因",
    "final_root_cause_owner": "material/targeting/product/pricing/live_room/after_sales/mixed/unknown",
    "reasoning": "120 字以内，说明为什么是这个环节",
    "why": "说明数据证据和内容证据如何共同支持结论",
    "metric_evidence": ["metric:ctr"],
    "content_evidence": ["content:hook"],
    "contradictions": [
      {{
        "type": "data_content_mismatch",
        "description": "数据与内容判断不一致时说明优先排查方向",
        "data_evidence_refs": ["metric:ctr"],
        "content_evidence_refs": ["content:hook"]
      }}
    ],
    "live_acceptance_attribution": {{
      "level": "account_date_environment/not_applicable/missing",
      "confidence": "high/medium/low",
      "source": "直播承接数据来源或空字符串",
      "limitation": "直播间成交数据为账号/日期级承接环境，不代表单 material_id 精确成交贡献"
    }},
    "product_card_acceptance_attribution": {{
      "level": "product_day_aligned/product_range_aligned/account_date_context/missing_card_acceptance/not_applicable",
      "confidence": "high/medium/low",
      "source": "ods.douyin_trade_sale_card_detail_raw 或空字符串",
      "bridge_source": "ads.douyin_shortvideo_detail 或空字符串",
      "source_grain": "shop_id + stat_date + product_id + source_level1",
      "required_bridge": "trusted material_id -> product_id",
      "limitation": "商品卡承接不是 material_id 直连；缺可信 product_id、日期窗口和 source_level1 对齐时，不能归因到单 material_id 的商品卡 GMV"
    }},
    "confidence": 0-1,
    "next_version_direction": "下一版复剪/脚本/投放动作"
  }},
  "evidence_ledger": [
    {{
      "id": "fusion:root_cause",
      "type": "fusion",
      "metric": "root_cause",
      "label": "综合根因",
      "value": "一句话判断",
      "benchmark": "同时能解释数据表现和内容表现",
      "benchmark_position": "good/weak",
      "judgment": "good/weak",
      "source": "performanceDiagnosis + input_video + transcript",
      "meaning": "这条综合证据说明的问题"
    }}
  ],
  "contradictions": [
    {{
      "type": "data_content_mismatch",
      "description": "视频利益点表达清晰但 CTR 仍低，优先怀疑封面、人群或投放入口。",
      "data_evidence_refs": ["metric:ctr"],
      "content_evidence_refs": ["content:hook"]
    }}
  ],
  "scores": {{
    "data_performance_score": 0-100,
    "content_quality_score": 0-100,
    "hook_score": 0-100,
    "selling_point_score": 0-100,
    "conversion_support_score": 0-100,
    "live_entry_score": 0-100,
    "live_acceptance_score": 0-100,
    "risk_score": 0-100,
    "fusion_overall_score": 0-100,
    "confidence": 0-1
  }},
  "next_actions": [
    {{
      "title": "动作标题",
      "action": "动作标题",
      "detail": "执行说明",
      "reason": "为什么做",
      "owner": "creative/media_buying/product_offer/live_room/live_room_offer/data_sample/data_linkage/growth/unknown",
      "action_type": "rewrite_hook",
      "problem_stage": "creative_click_weak",
      "priority": "high/medium/low",
      "expected_metric_lift": "预期影响的指标",
      "metric_target": "预期影响的指标",
      "evidence_refs": ["metric:ctr", "content:hook"]
    }}
  ],
  "confidence": 0-1 的数字
}}
"""


def content_asset_analysis_json_schema() -> Dict[str, Any]:
  short_string = {"type": "string", "maxLength": 160}
  string_array = {"type": "array", "items": short_string, "maxItems": 8}
  string_ref_array = {
    "type": "array",
    "items": {"type": "string", "maxLength": 80},
    "maxItems": 8,
  }
  diagnosis_point_item = {
    "type": "object",
    "additionalProperties": False,
    "required": ["text", "evidence_refs"],
    "properties": {
      "text": {"type": "string", "maxLength": 220},
      "evidence_refs": string_ref_array,
    },
  }
  diagnosis_point_array = {
    "type": "array",
    "items": diagnosis_point_item,
    "maxItems": 8,
  }
  evidence_item = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "id",
      "type",
      "metric",
      "label",
      "value",
      "benchmark",
      "benchmark_position",
      "judgment",
      "source",
      "meaning",
    ],
    "properties": {
      "id": {"type": "string", "maxLength": 80},
      "type": {"type": "string", "enum": ["metric", "content", "fusion", "sample", "benchmark"]},
      "metric": {"type": "string", "maxLength": 80},
      "label": {"type": "string", "maxLength": 80},
      "value": {"type": "string", "maxLength": 120},
      "benchmark": {"type": "string", "maxLength": 160},
      "benchmark_position": {"type": "string", "maxLength": 80},
      "judgment": {"type": "string", "maxLength": 80},
      "source": {"type": "string", "maxLength": 160},
      "meaning": {"type": "string", "maxLength": 220},
    },
  }
  evidence_array = {
    "type": "array",
    "items": evidence_item,
    "maxItems": 12,
  }
  contradiction_item = {
    "type": "object",
    "additionalProperties": False,
    "required": ["type", "description"],
    "properties": {
      "type": {"type": "string", "maxLength": 80},
      "description": {"type": "string", "maxLength": 260},
      "data_evidence_refs": string_ref_array,
      "content_evidence_refs": string_ref_array,
      "evidence_refs": string_ref_array,
    },
  }
  contradiction_array = {
    "type": "array",
    "items": contradiction_item,
    "maxItems": 8,
  }
  live_acceptance_attribution_schema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["level", "confidence", "source", "limitation"],
    "properties": {
      "level": {
        "type": "string",
        "enum": ["account_date_environment", "not_applicable", "missing"],
      },
      "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
      "source": {"type": "string", "maxLength": 160},
      "limitation": {"type": "string", "maxLength": 260},
    },
  }
  product_card_acceptance_attribution_schema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["level", "confidence", "source", "required_bridge", "limitation"],
    "properties": {
      "level": {
        "type": "string",
        "enum": [
          "product_day_aligned",
          "product_range_aligned",
          "account_date_context",
          "missing_card_acceptance",
          "not_applicable",
        ],
      },
      "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
      "source": {"type": "string", "maxLength": 160},
      "bridge_source": {"type": "string", "maxLength": 160},
      "source_grain": {"type": "string", "maxLength": 160},
      "required_bridge": {"type": "string", "maxLength": 160},
      "limitation": {"type": "string", "maxLength": 320},
    },
  }
  sample_metric_object = {
    "type": "object",
    "additionalProperties": False,
    "required": ["total_impressions", "total_clicks", "total_cost"],
    "properties": {
      "total_impressions": {"type": "number"},
      "total_clicks": {"type": "number"},
      "total_cost": {"type": "number"},
    },
  }
  failed_sample_threshold = {
    "type": "object",
    "additionalProperties": False,
    "required": ["metric", "label", "value", "minimum", "meaning"],
    "properties": {
      "metric": {"type": "string", "maxLength": 80},
      "label": {"type": "string", "maxLength": 80},
      "value": {"type": "number"},
      "minimum": {"type": "number"},
      "meaning": {"type": "string", "maxLength": 180},
    },
  }
  action_item = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "title",
      "action",
      "detail",
      "reason",
      "owner",
      "action_type",
      "problem_stage",
      "priority",
      "expected_metric_lift",
      "metric_target",
      "evidence_refs",
    ],
    "properties": {
      "title": {"type": "string", "maxLength": 180},
      "action": {"type": "string", "maxLength": 180},
      "detail": {"type": "string", "maxLength": 260},
      "reason": {"type": "string", "maxLength": 260},
      "owner": {"type": "string", "maxLength": 80},
      "action_type": {"type": "string", "enum": list(CANONICAL_CONTENT_ASSET_ACTION_TYPES)},
      "problem_stage": {"type": "string", "maxLength": 100},
      "priority": {"type": "string", "enum": ["high", "medium", "low"]},
      "expected_metric_lift": {"type": "string", "maxLength": 180},
      "metric_target": {"type": "string", "maxLength": 180},
      "evidence_refs": {
        "type": "array",
        "items": {"type": "string", "maxLength": 80},
        "maxItems": 6,
      },
    },
  }
  content_understanding_schema = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "what_it_says",
      "content_structure",
      "core_selling_points",
      "visual_rhythm",
      "speech_and_emotion",
      "user_comprehension_barrier",
      "reusable_content_assets",
    ],
    "properties": {
      "what_it_says": {"type": "string", "maxLength": 360},
      "content_structure": {"type": "string", "maxLength": 360},
      "core_selling_points": {"type": "string", "maxLength": 360},
      "visual_rhythm": {"type": "string", "maxLength": 360},
      "speech_and_emotion": {"type": "string", "maxLength": 360},
      "user_comprehension_barrier": {"type": "string", "maxLength": 360},
      "reusable_content_assets": {"type": "string", "maxLength": 360},
    },
  }
  current_ai_analysis_schema = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "content_understanding",
      "final_judgment",
      "core_reasons",
      "problem_stages",
      "next_actions",
    ],
    "properties": {
      "content_understanding": content_understanding_schema,
      "final_judgment": {"type": "string", "maxLength": 260},
      "core_reasons": string_array,
      "problem_stages": string_ref_array,
      "next_actions": {
        "type": "array",
        "items": action_item,
        "maxItems": 5,
      },
    },
  }
  diagnosis_boundary_schema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["mode", "message", "data_evidence_summary", "data_mapping_anchor"],
    "properties": {
      "mode": {
        "type": "string",
        "enum": ["data_content_fusion", "content_only", "data_only", "insufficient_data"],
      },
      "message": {"type": "string", "maxLength": 260},
      "data_evidence_summary": {"type": "string", "maxLength": 220},
      "data_mapping_anchor": {"type": "string", "enum": ["performance-summary", "data-mapping"]},
    },
  }
  return {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "analysis_schema_version",
      "diagnosis_mode",
      "primary_decision",
      "delivery_mode",
      "objective",
      "suggested_title",
      "suggested_tags",
      "summary",
      "score",
      "hook_type",
      "first_3s_assessment",
      "timeline",
      "scene_tags",
      "product_tags",
      "selling_points",
      "risk_flags",
      "current_ai_analysis",
      "diagnosis_boundary",
      "video_understanding",
      "repurpose_suggestions",
      "platform_fit",
      "sample_gate",
      "benchmark_context",
      "live_acceptance_attribution",
      "product_card_acceptance_attribution",
      "performance_diagnosis",
      "content_diagnosis",
      "fusion_diagnosis",
      "evidence_ledger",
      "contradictions",
      "scores",
      "next_actions",
      "confidence",
    ],
    "properties": {
      "analysis_schema_version": {"type": "string", "enum": ["2.1"]},
      "diagnosis_mode": {
        "type": "string",
        "enum": ["data_content_fusion", "data_only", "content_only", "insufficient_data"],
      },
      "primary_decision": {"type": "string", "enum": list(PRIMARY_DECISION_VALUES)},
      "delivery_mode": {"type": "string", "enum": ["qianchuan_all_domain", "unknown"]},
      "objective": {
        "type": "string",
        "enum": ["product_all_domain_shortvideo", "live_all_domain_shortvideo", "unknown"],
      },
      "suggested_title": {"type": "string", "maxLength": 80},
      "suggested_tags": {
        "type": "array",
        "items": {"type": "string"},
        "minItems": 3,
        "maxItems": 6,
      },
      "summary": {"type": "string", "maxLength": 180},
      "score": {"type": "number"},
      "hook_type": short_string,
      "first_3s_assessment": {"type": "string", "maxLength": 240},
      "timeline": {
        "type": "array",
        "maxItems": 3,
        "items": {
          "type": "object",
          "additionalProperties": False,
          "required": [
            "start_time",
            "end_time",
            "visual",
            "audio_or_text",
            "purpose",
            "quality_signal",
          ],
          "properties": {
            "start_time": {"type": "string"},
            "end_time": {"type": "string"},
            "visual": {"type": "string", "maxLength": 160},
            "audio_or_text": {"type": "string", "maxLength": 160},
            "purpose": {"type": "string", "maxLength": 120},
            "quality_signal": {"type": "string", "maxLength": 160},
          },
        },
      },
      "scene_tags": string_array,
      "product_tags": string_array,
      "selling_points": string_array,
      "risk_flags": string_array,
      "current_ai_analysis": current_ai_analysis_schema,
      "diagnosis_boundary": diagnosis_boundary_schema,
      "video_understanding": {
        "type": "object",
        "additionalProperties": False,
        "required": [
          "hook",
          "timeline",
          "visual",
          "script",
          "product_cart_fit",
          "live_room_fit",
          "risk_flags",
        ],
        "properties": {
          "hook": {
            "type": "object",
            "additionalProperties": False,
            "required": ["time_range", "type", "strength", "observation", "issue"],
            "properties": {
              "time_range": {"type": "string", "maxLength": 40},
              "type": short_string,
              "strength": {"type": "string", "enum": ["strong", "medium", "weak"]},
              "observation": {"type": "string", "maxLength": 220},
              "issue": {"type": "string", "maxLength": 220},
            },
          },
          "timeline": {
            "type": "array",
            "maxItems": 3,
            "items": {
              "type": "object",
              "additionalProperties": False,
              "required": ["time_range", "visual", "script", "business_meaning"],
              "properties": {
                "time_range": {"type": "string", "maxLength": 40},
                "visual": {"type": "string", "maxLength": 160},
                "script": {"type": "string", "maxLength": 160},
                "business_meaning": {"type": "string", "maxLength": 220},
              },
            },
          },
          "visual": {
            "type": "object",
            "additionalProperties": False,
            "required": [
              "clarity",
              "product_visibility",
              "before_after_contrast",
              "trust_signal",
            ],
            "properties": {
              "clarity": {"type": "string", "enum": ["strong", "medium", "weak"]},
              "product_visibility": {"type": "string", "enum": ["strong", "medium", "weak"]},
              "before_after_contrast": {"type": "string", "enum": ["strong", "medium", "weak", "none"]},
              "trust_signal": {"type": "string", "enum": ["strong", "medium", "weak", "none"]},
            },
          },
          "script": {
            "type": "object",
            "additionalProperties": False,
            "required": [
              "pain_point_clarity",
              "selling_point_clarity",
              "price_or_offer_clarity",
              "cta_clarity",
            ],
            "properties": {
              "pain_point_clarity": {"type": "string", "enum": ["strong", "medium", "weak"]},
              "selling_point_clarity": {"type": "string", "enum": ["strong", "medium", "weak"]},
              "price_or_offer_clarity": {"type": "string", "enum": ["strong", "medium", "weak", "none"]},
              "cta_clarity": {"type": "string", "enum": ["strong", "medium", "weak", "none"]},
            },
          },
          "product_cart_fit": {
            "type": "object",
            "additionalProperties": False,
            "required": ["product_decision_support", "commodity_trust_signal"],
            "properties": {
              "product_decision_support": {"type": "string", "enum": ["strong", "medium", "weak"]},
              "commodity_trust_signal": {"type": "string", "enum": ["strong", "medium", "weak"]},
            },
          },
          "live_room_fit": {
            "type": "object",
            "additionalProperties": False,
            "required": ["entry_reason_clarity", "live_benefit_signal", "urgency_signal"],
            "properties": {
              "entry_reason_clarity": {"type": "string", "enum": ["strong", "medium", "weak", "none"]},
              "live_benefit_signal": {"type": "string", "enum": ["strong", "medium", "weak", "none"]},
              "urgency_signal": {"type": "string", "enum": ["strong", "medium", "weak", "none"]},
            },
          },
          "risk_flags": string_array,
        },
      },
      "repurpose_suggestions": string_array,
      "platform_fit": {
        "type": "object",
        "additionalProperties": False,
        "required": ["douyin", "xiaohongshu", "qianchuan", "product_cart", "live_room"],
        "properties": {
          "douyin": {"type": "string"},
          "xiaohongshu": {"type": "string"},
          "qianchuan": {"type": "string"},
          "product_cart": {"type": "string"},
          "live_room": {"type": "string"},
        },
      },
      "sample_gate": {
        "type": "object",
        "additionalProperties": False,
        "required": ["status", "decision", "observed", "minimums", "failed_thresholds"],
        "properties": {
          "status": {"type": "string", "enum": ["ok", "insufficient_sample", "missing"]},
          "decision": {
            "type": "string",
            "enum": ["allow_directional_verdict", "early_signal_only", "content_only"],
          },
          "observed": sample_metric_object,
          "minimums": sample_metric_object,
          "failed_thresholds": {
            "type": "array",
            "items": failed_sample_threshold,
            "maxItems": 3,
          },
        },
      },
      "benchmark_context": {
        "type": "object",
        "additionalProperties": False,
        "required": ["objective", "scope", "status", "window_days", "source", "sample_status", "note"],
        "properties": {
          "objective": {"type": "string", "maxLength": 80},
          "scope": {"type": "string", "maxLength": 80},
          "status": {
            "type": "string",
            "enum": ["static_fallback", "live_benchmark", "insufficient_benchmark", "missing"],
          },
          "window_days": {"type": "string", "maxLength": 40},
          "source": {"type": "string", "maxLength": 160},
          "sample_status": {"type": "string", "maxLength": 80},
          "note": {"type": "string", "maxLength": 240},
        },
      },
      "live_acceptance_attribution": live_acceptance_attribution_schema,
      "product_card_acceptance_attribution": product_card_acceptance_attribution_schema,
      "performance_diagnosis": {
        "type": "object",
        "additionalProperties": False,
        "required": [
          "verdict",
          "problem_stage",
          "root_cause_owner_by_data",
          "good_points",
          "bad_points",
          "metric_evidence",
        ],
        "properties": {
          "verdict": {"type": "string"},
          "problem_stage": {"type": "string"},
          "root_cause_owner_by_data": {"type": "string"},
          "good_points": string_array,
          "bad_points": string_array,
          "metric_evidence": evidence_array,
        },
      },
      "content_diagnosis": {
        "type": "object",
        "additionalProperties": False,
        "required": [
          "good_points",
          "bad_points",
          "hook_assessment",
          "cta_assessment",
          "message_match",
          "product_cart_fit",
          "live_room_fit",
          "risk_assessment",
          "content_evidence",
        ],
        "properties": {
          "good_points": string_array,
          "bad_points": string_array,
          "hook_assessment": {"type": "string", "maxLength": 240},
          "cta_assessment": {"type": "string", "maxLength": 240},
          "message_match": {"type": "string", "maxLength": 240},
          "product_cart_fit": {"type": "string", "maxLength": 240},
          "live_room_fit": {"type": "string", "maxLength": 240},
          "risk_assessment": {"type": "string", "maxLength": 240},
          "content_evidence": evidence_array,
        },
      },
      "fusion_diagnosis": {
        "type": "object",
        "additionalProperties": False,
        "required": [
          "one_sentence_summary",
          "final_verdict",
          "good_points",
          "bad_points",
          "problem_stage",
          "primary_problem_stage",
          "secondary_problem_stages",
          "root_cause_owner",
          "final_root_cause_owner",
          "reasoning",
          "why",
          "metric_evidence",
          "content_evidence",
          "contradictions",
          "live_acceptance_attribution",
          "product_card_acceptance_attribution",
          "confidence",
          "next_version_direction",
        ],
        "properties": {
          "one_sentence_summary": {"type": "string", "maxLength": 220},
          "final_verdict": {"type": "string"},
          "good_points": diagnosis_point_array,
          "bad_points": diagnosis_point_array,
          "problem_stage": {"type": "string"},
          "primary_problem_stage": {"type": "string"},
          "secondary_problem_stages": string_array,
          "root_cause_owner": {"type": "string"},
          "final_root_cause_owner": {"type": "string"},
          "reasoning": {"type": "string", "maxLength": 260},
          "why": {"type": "string", "maxLength": 320},
          "metric_evidence": string_ref_array,
          "content_evidence": string_ref_array,
          "contradictions": contradiction_array,
          "live_acceptance_attribution": live_acceptance_attribution_schema,
          "product_card_acceptance_attribution": product_card_acceptance_attribution_schema,
          "confidence": {"type": "number"},
          "next_version_direction": {"type": "string", "maxLength": 260},
        },
      },
      "scores": {
        "type": "object",
        "additionalProperties": False,
        "required": list(CONTENT_ASSET_SCORE_KEYS),
        "properties": {
          "data_performance_score": {"type": "number"},
          "content_quality_score": {"type": "number"},
          "hook_score": {"type": "number"},
          "selling_point_score": {"type": "number"},
          "conversion_support_score": {"type": "number"},
          "live_entry_score": {"type": "number"},
          "live_acceptance_score": {"type": "number"},
          "risk_score": {"type": "number"},
          "fusion_overall_score": {"type": "number"},
          "confidence": {"type": "number"},
        },
      },
      "evidence_ledger": evidence_array,
      "contradictions": contradiction_array,
      "next_actions": {
        "type": "array",
        "items": action_item,
        "maxItems": 8,
      },
      "confidence": {"type": "number"},
    },
  }


def extract_output_text(payload: Dict[str, Any]) -> str:
  direct = payload.get("output_text")
  if isinstance(direct, str) and direct.strip():
    return direct.strip()

  parts: List[str] = []

  def visit(value: Any) -> None:
    if isinstance(value, dict):
      item_type = str(value.get("type") or "")
      text = value.get("text")
      if item_type in {"output_text", "text"} and isinstance(text, str):
        parts.append(text)
        return
      for child in value.values():
        visit(child)
    elif isinstance(value, list):
      for item in value:
        visit(item)

  visit(payload.get("output"))
  text = "\n".join(part.strip() for part in parts if part.strip()).strip()
  if not text:
    raise ArkResponsesError("Ark Responses API 返回中未找到 output_text")
  return text


def parse_analysis_json(text: str) -> Dict[str, Any]:
  return _parse_analysis_json(text, ArkResponsesError)


def normalize_content_asset_analysis_contract(analysis: Dict[str, Any]) -> Dict[str, Any]:
  if not isinstance(analysis.get("video_understanding"), dict):
    analysis["video_understanding"] = _derive_video_understanding(analysis)
  if _normalized_text(analysis.get("primary_decision")) not in PRIMARY_DECISION_VALUES:
    analysis["primary_decision"] = _derive_primary_decision(analysis)
  current_ai_analysis = analysis.get("current_ai_analysis")
  if not isinstance(current_ai_analysis, dict):
    analysis["current_ai_analysis"] = _derive_current_ai_analysis(analysis)
  elif not isinstance(current_ai_analysis.get("content_understanding"), dict):
    current_ai_analysis["content_understanding"] = _derive_content_understanding(analysis)
  if not isinstance(analysis.get("diagnosis_boundary"), dict):
    analysis["diagnosis_boundary"] = _derive_diagnosis_boundary(analysis)
  analysis["fusion_contract_validation"] = validate_content_asset_analysis_contract(analysis)
  return analysis


def validate_content_asset_analysis_contract(analysis: Mapping[str, Any]) -> Dict[str, Any]:
  errors: List[str] = []
  warnings: List[str] = []
  evidence_refs = _analysis_evidence_refs(analysis)
  fusion = _mapping_value(analysis.get("fusion_diagnosis"))
  diagnosis_mode = _normalized_text(analysis.get("diagnosis_mode"))

  if diagnosis_mode == "data_content_fusion" and not fusion:
    errors.append("fusion_diagnosis is required when diagnosis_mode=data_content_fusion")

  final_verdict = _normalized_text(fusion.get("final_verdict"))
  if final_verdict and not _fusion_has_evidence(fusion, evidence_refs):
    errors.append("fusion_diagnosis.final_verdict must be supported by metric/content evidence")

  _validate_diagnosis_points(
    fusion.get("good_points"),
    "fusion_diagnosis.good_points",
    evidence_refs,
    errors,
    warnings,
  )
  _validate_diagnosis_points(
    fusion.get("bad_points"),
    "fusion_diagnosis.bad_points",
    evidence_refs,
    errors,
    warnings,
  )
  _validate_next_actions(analysis.get("next_actions"), evidence_refs, errors, warnings)

  status = "valid"
  if errors:
    status = "invalid"
  elif warnings:
    status = "warning"
  return {
    "status": status,
    "errors": errors[:12],
    "warnings": warnings[:12],
    "evidence_ref_count": len(evidence_refs),
  }


def _derive_video_understanding(analysis: Mapping[str, Any]) -> Dict[str, Any]:
  platform_fit = _mapping_value(analysis.get("platform_fit"))
  content = _mapping_value(analysis.get("content_diagnosis"))
  timeline = analysis.get("timeline")
  timeline_items = []
  if isinstance(timeline, list):
    for item in timeline[:3]:
      item_map = _mapping_value(item)
      if not item_map:
        continue
      start_time = _normalized_text(item_map.get("start_time"))
      end_time = _normalized_text(item_map.get("end_time"))
      timeline_items.append({
        "time_range": _join_time_range(start_time, end_time),
        "visual": _normalized_text(item_map.get("visual")),
        "script": _normalized_text(item_map.get("audio_or_text")),
        "business_meaning": _normalized_text(item_map.get("purpose") or item_map.get("quality_signal")),
      })
  if not timeline_items:
    timeline_items = [{
      "time_range": "unknown",
      "visual": "",
      "script": "",
      "business_meaning": "",
    }]

  risk_flags = analysis.get("risk_flags")
  if not isinstance(risk_flags, list):
    risk_flags = []

  return {
    "hook": {
      "time_range": "00:00-00:03",
      "type": _normalized_text(analysis.get("hook_type")) or "不明确",
      "strength": _signal_strength(content.get("hook_assessment") or analysis.get("first_3s_assessment")),
      "observation": _normalized_text(analysis.get("first_3s_assessment")),
      "issue": _normalized_text(content.get("hook_assessment")),
    },
    "timeline": timeline_items,
    "visual": {
      "clarity": "medium",
      "product_visibility": "medium",
      "before_after_contrast": "none",
      "trust_signal": "none",
    },
    "script": {
      "pain_point_clarity": _signal_strength(content.get("message_match")),
      "selling_point_clarity": _signal_strength(analysis.get("selling_points")),
      "price_or_offer_clarity": "none",
      "cta_clarity": _signal_strength(content.get("cta_assessment")),
    },
    "product_cart_fit": {
      "product_decision_support": _signal_strength(content.get("product_cart_fit") or platform_fit.get("product_cart")),
      "commodity_trust_signal": "medium",
    },
    "live_room_fit": {
      "entry_reason_clarity": _signal_strength(content.get("live_room_fit") or platform_fit.get("live_room")),
      "live_benefit_signal": _signal_strength(content.get("live_room_fit") or platform_fit.get("live_room")),
      "urgency_signal": "none",
    },
    "risk_flags": [_normalized_text(item) for item in risk_flags if _normalized_text(item)][:8],
  }

def _derive_primary_decision(analysis: Mapping[str, Any]) -> str:
  fusion = _mapping_value(analysis.get("fusion_diagnosis"))
  verdict = _normalized_text(fusion.get("final_verdict") or analysis.get("final_verdict")).lower()
  diagnosis_mode = _normalized_text(analysis.get("diagnosis_mode")).lower()
  if diagnosis_mode == "insufficient_data" or "insufficient" in verdict:
    return "insufficient"
  if verdict in {"excellent", "good"}:
    return "scale"
  if verdict in {"average", "ok", "normal"}:
    return "observe"
  if verdict in {"weak", "needs_iteration"}:
    return "recut"
  if verdict in {"bad", "poor"}:
    return "pause"
  return "insufficient"


def _derive_current_ai_analysis(analysis: Mapping[str, Any]) -> Dict[str, Any]:
  fusion = _mapping_value(analysis.get("fusion_diagnosis"))
  content = _mapping_value(analysis.get("content_diagnosis"))
  next_actions = analysis.get("next_actions")
  if not isinstance(next_actions, list):
    next_actions = []
  core_reasons = _unique_non_empty([
    _normalized_text(fusion.get("one_sentence_summary")),
    _normalized_text(fusion.get("reasoning")),
    *_point_text_values(fusion.get("good_points")),
    *_point_text_values(fusion.get("bad_points")),
    *_list_text_values(content.get("bad_points")),
  ])[:5]
  problem_stages = _unique_non_empty([
    _normalized_text(fusion.get("primary_problem_stage")),
    _normalized_text(fusion.get("problem_stage")),
    *_list_text_values(fusion.get("secondary_problem_stages")),
  ])[:5]
  return {
    "content_understanding": _derive_content_understanding(analysis),
    "final_judgment": (
      _normalized_text(fusion.get("one_sentence_summary"))
      or _normalized_text(fusion.get("final_verdict"))
      or _derive_primary_decision(analysis)
    ),
    "core_reasons": core_reasons,
    "problem_stages": problem_stages,
    "next_actions": next_actions[:5],
  }


def _derive_content_understanding(analysis: Mapping[str, Any]) -> Dict[str, str]:
  content = _mapping_value(analysis.get("content_diagnosis"))
  platform_fit = _mapping_value(analysis.get("platform_fit"))
  video_understanding = _mapping_value(analysis.get("video_understanding"))
  video_hook = _mapping_value(video_understanding.get("hook"))
  video_visual = _mapping_value(video_understanding.get("visual"))
  video_script = _mapping_value(video_understanding.get("script"))
  selling_points = _list_text_values(analysis.get("selling_points"))
  risk_flags = _list_text_values(analysis.get("risk_flags"))
  repurpose = _list_text_values(analysis.get("repurpose_suggestions"))
  return {
    "what_it_says": _normalized_text(analysis.get("summary")),
    "content_structure": _timeline_structure_summary(analysis.get("timeline")),
    "core_selling_points": _join_text_values(selling_points),
    "visual_rhythm": _join_text_values([
      _normalized_text(analysis.get("first_3s_assessment")),
      _normalized_text(video_hook.get("observation")),
      f"画面清晰度 {video_visual.get('clarity')}" if video_visual.get("clarity") else "",
    ], limit=2),
    "speech_and_emotion": _join_text_values([
      _normalized_text(content.get("message_match")),
      _normalized_text(content.get("cta_assessment")),
      f"卖点清晰度 {video_script.get('selling_point_clarity')}" if video_script.get("selling_point_clarity") else "",
    ], limit=2),
    "user_comprehension_barrier": _join_text_values(risk_flags) or _normalized_text(content.get("risk_assessment")),
    "reusable_content_assets": (
      _join_text_values(repurpose)
      or _normalized_text(platform_fit.get("qianchuan"))
      or _normalized_text(content.get("product_cart_fit"))
      or _normalized_text(content.get("live_room_fit"))
    ),
  }


def _derive_diagnosis_boundary(analysis: Mapping[str, Any]) -> Dict[str, str]:
  mode = _normalized_text(analysis.get("diagnosis_mode"))
  if mode not in {"data_content_fusion", "content_only", "data_only", "insufficient_data"}:
    mode = "insufficient_data"
  defaults = {
    "data_content_fusion": (
      "已结合千川素材表现和视频内容判断。",
      "已使用千川素材表现和内容理解。",
      "performance-summary",
    ),
    "content_only": (
      "缺投放样本，仅按视频内容、画面、脚本、口播和节奏复盘。",
      "",
      "data-mapping",
    ),
    "data_only": (
      "缺内容理解，仅按千川表现数据复盘。",
      "已使用千川素材表现。",
      "performance-summary",
    ),
    "insufficient_data": (
      "数据和内容证据都不足，仅展示可确认线索。",
      "",
      "data-mapping",
    ),
  }
  message, data_summary, anchor = defaults[mode]
  return {
    "mode": mode,
    "message": message,
    "data_evidence_summary": data_summary,
    "data_mapping_anchor": anchor,
  }


def _analysis_evidence_refs(analysis: Mapping[str, Any]) -> set[str]:
  refs: set[str] = set()

  def add_ref(value: Any) -> None:
    text = _normalized_text(value)
    if text:
      refs.add(text)

  def collect(value: Any) -> None:
    if isinstance(value, Mapping):
      add_ref(value.get("id"))
      for key in ("metric_evidence", "content_evidence", "evidence_refs"):
        nested = value.get(key)
        if isinstance(nested, list):
          for item in nested:
            collect(item)
    elif isinstance(value, list):
      for item in value:
        collect(item)
    else:
      add_ref(value)

  for key in (
    "evidence_ledger",
    "metric_evidence",
    "content_evidence",
    "performance_diagnosis",
    "content_diagnosis",
    "fusion_diagnosis",
  ):
    collect(analysis.get(key))
  return refs


def _fusion_has_evidence(fusion: Mapping[str, Any], evidence_refs: set[str]) -> bool:
  refs = _list_text_values(fusion.get("metric_evidence")) + _list_text_values(fusion.get("content_evidence"))
  if any(ref in evidence_refs or ref.startswith(("metric:", "content:", "fusion:")) for ref in refs):
    return True
  return bool(evidence_refs)


def _validate_diagnosis_points(
  value: Any,
  label: str,
  evidence_refs: set[str],
  errors: List[str],
  warnings: List[str],
) -> None:
  if value in (None, ""):
    return
  if not isinstance(value, list):
    warnings.append(f"{label} should be an array of evidence-bound objects")
    return
  for index, item in enumerate(value, start=1):
    if isinstance(item, str):
      warnings.append(f"{label}[{index}] is legacy string and has no per-item evidence_refs")
      continue
    item_map = _mapping_value(item)
    if not item_map:
      warnings.append(f"{label}[{index}] is not an object")
      continue
    if not _normalized_text(item_map.get("text")):
      errors.append(f"{label}[{index}].text is required")
    refs = _list_text_values(item_map.get("evidence_refs"))
    if not refs:
      errors.append(f"{label}[{index}].evidence_refs is required")
    elif evidence_refs and not any(ref in evidence_refs for ref in refs):
      warnings.append(f"{label}[{index}].evidence_refs do not match evidence ledger")


def _validate_next_actions(
  value: Any,
  evidence_refs: set[str],
  errors: List[str],
  warnings: List[str],
) -> None:
  if value in (None, ""):
    return
  if not isinstance(value, list):
    warnings.append("next_actions should be an array")
    return
  for index, item in enumerate(value, start=1):
    item_map = _mapping_value(item)
    if not item_map:
      warnings.append(f"next_actions[{index}] is not an object")
      continue
    if not _normalized_text(item_map.get("problem_stage")):
      errors.append(f"next_actions[{index}].problem_stage is required")
    if not (_normalized_text(item_map.get("expected_metric_lift")) or _normalized_text(item_map.get("metric_target"))):
      errors.append(f"next_actions[{index}].expected_metric_lift or metric_target is required")
    refs = _list_text_values(item_map.get("evidence_refs"))
    if not refs:
      errors.append(f"next_actions[{index}].evidence_refs is required")
    elif evidence_refs and not any(ref in evidence_refs for ref in refs):
      warnings.append(f"next_actions[{index}].evidence_refs do not match evidence ledger")


def _mapping_value(value: Any) -> Mapping[str, Any]:
  return value if isinstance(value, Mapping) else {}


def _list_text_values(value: Any) -> List[str]:
  if not isinstance(value, list):
    return []
  return [_normalized_text(item) for item in value if _normalized_text(item)]


def _point_text_values(value: Any) -> List[str]:
  if not isinstance(value, list):
    return []
  texts: List[str] = []
  for item in value:
    if isinstance(item, Mapping):
      text = _normalized_text(item.get("text") or item.get("summary") or item.get("title"))
    else:
      text = _normalized_text(item)
    if text:
      texts.append(text)
  return texts


def _unique_non_empty(values: List[str]) -> List[str]:
  result: List[str] = []
  for value in values:
    text = _normalized_text(value)
    if text and text not in result:
      result.append(text)
  return result


def _join_text_values(values: List[str], limit: int = 4) -> str:
  return "；".join(_unique_non_empty(values)[:limit])


def _timeline_structure_summary(value: Any) -> str:
  if not isinstance(value, list):
    return ""
  parts: List[str] = []
  for item in value[:3]:
    item_map = _mapping_value(item)
    if not item_map:
      continue
    purpose = _normalized_text(item_map.get("purpose"))
    signal = _normalized_text(item_map.get("quality_signal"))
    visual = _normalized_text(item_map.get("visual"))
    text = "，".join(_unique_non_empty([purpose, signal or visual])[:2])
    if text:
      parts.append(text)
  return _join_text_values(parts, limit=3)


def _normalized_text(value: Any) -> str:
  if isinstance(value, str):
    return re.sub(r"\s+", " ", value.strip())
  if isinstance(value, (int, float)) and not isinstance(value, bool):
    return str(value)
  return ""


def _join_time_range(start_time: str, end_time: str) -> str:
  if start_time and end_time:
    return f"{start_time}-{end_time}"
  return start_time or end_time or "unknown"


def _signal_strength(value: Any) -> str:
  text = json.dumps(value, ensure_ascii=False).lower() if isinstance(value, (dict, list)) else _normalized_text(value).lower()
  if any(token in text for token in ("strong", "强", "高", "清晰", "清楚", "明确", "优秀")):
    return "strong"
  if any(token in text for token in ("weak", "弱", "低", "不清晰", "不明确", "缺失")):
    return "weak"
  return "medium"


def normalized_summary(analysis: Dict[str, Any]) -> str:
  fusion_diagnosis = analysis.get("fusion_diagnosis")
  if isinstance(fusion_diagnosis, dict):
    value = fusion_diagnosis.get("one_sentence_summary")
    if isinstance(value, str) and value.strip():
      return value.strip()[:500]
  for key in ("summary", "ai_summary", "conclusion"):
    value = analysis.get(key)
    if isinstance(value, str) and value.strip():
      return value.strip()[:500]
  return ""


def normalized_score(analysis: Dict[str, Any]) -> Optional[float]:
  scores = analysis.get("scores")
  if isinstance(scores, dict):
    value = scores.get("fusion_overall_score")
    try:
      score = float(value)
    except (TypeError, ValueError):
      score = -1.0
    if score >= 0:
      return max(0.0, min(10.0, score / 10.0 if score > 10 else score))
  for key in ("score", "ai_score", "overall_score"):
    value = analysis.get(key)
    if value is None:
      continue
    try:
      score = float(value)
    except (TypeError, ValueError):
      continue
    return max(0.0, min(10.0, score))
  return None


def normalized_suggested_title(analysis: Dict[str, Any]) -> str:
  for key in ("suggested_title", "suggestedTitle", "title", "ai_title"):
    value = analysis.get(key)
    if isinstance(value, str) and value.strip():
      return re.sub(r"\s+", " ", value.strip())[:80]
  return ""


def normalized_suggested_tags(analysis: Dict[str, Any], limit: int = 6) -> List[str]:
  tags: List[str] = []
  for key in ("suggested_tags", "suggestedTags", "scene_tags", "product_tags", "selling_points"):
    value = analysis.get(key)
    if not isinstance(value, list):
      continue
    for item in value:
      if not isinstance(item, str):
        continue
      tag = re.sub(r"\s+", " ", item.strip())
      if tag and tag not in tags:
        tags.append(tag[:32])
      if len(tags) >= limit:
        return tags
  return tags


def _env_int(name: str, default: int) -> int:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    return int(raw)
  except ValueError as error:
    raise ArkResponsesError(f"{name} 必须是整数") from error


def _env_float(name: str, default: float) -> float:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    return float(raw)
  except ValueError as error:
    raise ArkResponsesError(f"{name} 必须是数字") from error


def _env_bool(name: str, default: bool) -> bool:
  raw = (os.getenv(name) or "").strip().lower()
  if not raw:
    return default
  if raw in {"1", "true", "yes", "y", "on"}:
    return True
  if raw in {"0", "false", "no", "n", "off"}:
    return False
  raise ArkResponsesError(f"{name} 必须是布尔值")


def _env_choice(name: str, default: str, allowed: set[str]) -> str:
  value = (os.getenv(name) or default).strip().lower()
  if value not in allowed:
    raise ArkResponsesError(f"{name} 必须是以下值之一: {', '.join(sorted(allowed))}")
  return value


def _bounded_fps(value: float) -> float:
  if value < 0.2 or value > 5:
    raise ArkResponsesError("Ark 视频 fps 必须在 0.2 到 5 之间")
  return value


def _analysis_prompt_version(prompt_version: str, schema_version: str) -> str:
  normalized = (prompt_version or "v1").strip()
  if normalized.startswith("content_asset_analysis:"):
    return normalized
  return f"content_asset_analysis:{normalized}:schema:{schema_version}"


def _redact_sensitive(value: str) -> str:
  redacted = re.sub(r"(X-Amz-Credential=)[^&\"'\\s]+", r"\1<redacted>", value)
  redacted = re.sub(r"(X-Amz-Signature=)[^&\"'\\s]+", r"\1<redacted>", redacted)
  redacted = re.sub(r"(X-Amz-Security-Token=)[^&\"'\\s]+", r"\1<redacted>", redacted)
  redacted = re.sub(r"(Bearer\\s+)[A-Za-z0-9._\\-]+", r"\1<redacted>", redacted)
  return redacted
