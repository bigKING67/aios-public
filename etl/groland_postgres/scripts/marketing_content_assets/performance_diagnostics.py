from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


PRODUCT_OBJECTIVE = "product_all_domain_shortvideo"
LIVE_OBJECTIVE = "live_all_domain_shortvideo"
DELIVERY_MODE = "qianchuan_all_domain"
CANONICAL_ACTION_TYPES = (
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
PRODUCT_CARD_ACCEPTANCE_ALIGNED_LEVELS = frozenset({
  "product_day_aligned",
  "product_range_aligned",
})
PRODUCT_CARD_ACCEPTANCE_KNOWN_LEVELS = PRODUCT_CARD_ACCEPTANCE_ALIGNED_LEVELS | frozenset({
  "account_date_context",
  "missing_card_acceptance",
  "not_applicable",
})


@dataclass(frozen=True)
class MetricEvidence:
  key: str
  label: str
  value: float | int | str | None
  benchmark: str
  judgment: str
  source: str
  meaning: str

  def to_dict(self) -> dict[str, Any]:
    return {
      "id": f"metric:{self.key}",
      "type": "metric",
      "key": self.key,
      "metric": self.key,
      "label": self.label,
      "title": self.label,
      "value": self.value,
      "benchmark": self.benchmark,
      "benchmark_value": self.benchmark,
      "benchmark_position": self.judgment,
      "judgment": self.judgment,
      "source": self.source,
      "meaning": self.meaning,
    }


def build_performance_diagnosis(
  metrics: Mapping[str, Any],
  *,
  live_acceptance: Mapping[str, Any] | None = None,
  product_card_acceptance: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
  objective = str(metrics.get("objective") or "").strip()
  if objective == LIVE_OBJECTIVE:
    return _diagnose_live(metrics, live_acceptance=live_acceptance)
  return _diagnose_product(metrics, product_card_acceptance=product_card_acceptance)


def _diagnose_product(
  metrics: Mapping[str, Any],
  *,
  product_card_acceptance: Mapping[str, Any] | None,
) -> dict[str, Any]:
  impressions = _number(metrics, "total_impressions", "overall_impression_count")
  clicks = _number(metrics, "total_clicks", "overall_click_count")
  cost = _number(metrics, "total_cost", "overall_cost")
  orders = _number(metrics, "total_orders", "overall_order_count")
  roi = _number(metrics, "pay_roi", "overall_pay_roi")
  net_roi = _number(metrics, "net_gmv_roi")
  ctr = _number(metrics, "ctr", "overall_click_rate")
  cvr = _number(metrics, "cvr", "overall_conversion_rate")
  refund_rate = _number(metrics, "refund_rate_1h")
  settlement_rate = _number(metrics, "net_gmv_settlement_rate")
  sample_gate = _sample_gate(impressions, clicks, cost)
  sample_status = sample_gate["status"]
  benchmark_context = _benchmark_context(PRODUCT_OBJECTIVE, metrics, sample_gate)
  ctr_p25 = _benchmark_value(benchmark_context, "ctr", "p25", 0.012)
  cvr_p25 = _benchmark_value(benchmark_context, "cvr", "p25", 0.02)
  roi_p25 = _benchmark_value(benchmark_context, "pay_roi", "p25", 1.2)
  net_roi_p25 = _benchmark_value(benchmark_context, "net_gmv_roi", "p25", 1.0)
  settlement_p25 = _benchmark_value(benchmark_context, "net_gmv_settlement_rate", "p25", 0.75)
  refund_p75 = _benchmark_value(benchmark_context, "refund_rate_1h", "p75", 0.1)
  card_attribution = _product_card_acceptance_attribution(product_card_acceptance)
  has_card_acceptance = card_attribution["level"] in PRODUCT_CARD_ACCEPTANCE_ALIGNED_LEVELS

  evidence = [
    _evidence("total_impressions", "曝光规模", impressions, ">= 1000", impressions >= 1000, "dwd.marketing_content_qianchuan_material_performance_di", "判断挂车素材是否已获得足够测试流量。"),
    _evidence("ctr", "点击率", ctr, _lower_bound_label("ctr", ctr_p25, ">= 1.2%"), ctr >= ctr_p25, "dwd.marketing_content_qianchuan_material_performance_di", "判断前三秒钩子和首屏卖点是否能驱动商品卡点击。"),
    _evidence("cvr", "点击-成交率", cvr, _lower_bound_label("cvr", cvr_p25, ">= 2%"), cvr >= cvr_p25, "dwd.marketing_content_qianchuan_material_performance_di", "判断商品利益点、价格机制和信任背书是否承接点击。"),
    _evidence("pay_roi", "支付 ROI", roi, _lower_bound_label("pay_roi", roi_p25, ">= 1.2"), roi >= roi_p25, "dwd.marketing_content_qianchuan_material_performance_di", "判断挂车成交型素材是否具备基础放量效率。"),
    _evidence("refund_rate_1h", "1小时退款率", refund_rate, _upper_bound_label("refund_rate_1h", refund_p75, "<= 10%"), refund_rate <= refund_p75, "dwd.marketing_content_qianchuan_material_performance_di", "识别功效承诺、价格预期或履约体验带来的早退风险。"),
  ]
  if _has_number(metrics, "net_gmv_roi"):
    evidence.append(
      _evidence("net_gmv_roi", "净 GMV ROI", net_roi, _lower_bound_label("net_gmv_roi", net_roi_p25, ">= 1.0"), net_roi >= net_roi_p25, "dwd.marketing_content_qianchuan_material_performance_di", "避免只看支付 ROI，识别退款、结算或履约后的真实成交质量。")
    )
  if _has_number(metrics, "net_gmv_settlement_rate"):
    evidence.append(
      _evidence("net_gmv_settlement_rate", "净 GMV 结算率", settlement_rate, _lower_bound_label("net_gmv_settlement_rate", settlement_p25, ">= 75%"), settlement_rate >= settlement_p25, "dwd.marketing_content_qianchuan_material_performance_di", "判断支付成交是否能稳定转化为结算成交。")
    )

  net_settlement_weak = (
    (_has_number(metrics, "net_gmv_roi") and net_roi < net_roi_p25)
    or (_has_number(metrics, "net_gmv_settlement_rate") and settlement_rate < settlement_p25)
  )

  if sample_status != "ok":
    stage = "insufficient_data"
    owner = "data_sample"
  elif impressions < 1000:
    stage = "traffic_scale_weak"
    owner = "media_buying"
  elif ctr < ctr_p25:
    stage = "creative_click_weak"
    owner = "creative"
  elif cvr < cvr_p25:
    stage = "product_conversion_weak"
    owner = "product_offer"
  elif roi < roi_p25:
    stage = "cost_efficiency_weak"
    owner = "media_buying"
  elif refund_rate > refund_p75:
    stage = "refund_risk_high"
    owner = "product_or_after_sales"
  elif net_settlement_weak:
    stage = "net_settlement_weak"
    owner = "fulfillment_or_after_sales"
  else:
    stage = "scale_candidate"
    owner = "growth"

  return _diagnosis_payload(
    objective=PRODUCT_OBJECTIVE,
    verdict=_stage_verdict(stage, scale_stage="scale_candidate"),
    problem_stage=stage,
    root_cause_owner=owner,
    evidence=evidence,
    good_points=_good_points(evidence),
    bad_points=_bad_points(evidence),
    next_actions=_product_actions(
      stage,
      evidence,
      missing_product_card_acceptance=card_attribution["level"] == "missing_card_acceptance",
    ),
    sample_quality_status=sample_status,
    sample_gate=sample_gate,
    benchmark_context=benchmark_context,
    extra={
      "product_card_acceptance_attribution": card_attribution,
      "has_product_card_acceptance": has_card_acceptance,
    },
  )


def _diagnose_live(
  metrics: Mapping[str, Any],
  *,
  live_acceptance: Mapping[str, Any] | None,
) -> dict[str, Any]:
  impressions = _number(metrics, "total_impressions", "overall_impression_count")
  clicks = _number(metrics, "total_clicks", "overall_click_count")
  cost = _number(metrics, "total_cost", "overall_cost")
  ctr = _number(metrics, "ctr", "overall_click_rate")
  complete_rate = _number(metrics, "video_complete_play_rate")
  play_5s = _number(metrics, "play_rate_5s")
  play_10s = _number(metrics, "play_rate_10s")
  roi = _number(metrics, "pay_roi", "overall_pay_roi")
  refund_rate = _number(metrics, "refund_rate_1h")
  sample_gate = _sample_gate(impressions, clicks, cost)
  sample_status = sample_gate["status"]
  benchmark_context = _benchmark_context(LIVE_OBJECTIVE, metrics, sample_gate)
  ctr_p25 = _benchmark_value(benchmark_context, "ctr", "p25", 0.012)
  complete_p25 = _benchmark_value(benchmark_context, "video_complete_play_rate", "p25", 0.12)
  play_5s_p25 = _benchmark_value(benchmark_context, "play_rate_5s", "p25", 0.35)
  product_click_p25 = _benchmark_value(benchmark_context, "product_click_rate_user", "p25", 0.08)
  watch_to_pay_p25 = _benchmark_value(benchmark_context, "watch_to_pay_rate_user", "p25", 0.015)
  click_to_pay_p25 = _benchmark_value(benchmark_context, "click_to_pay_rate_user", "p25", 0.05)
  roi_p25 = _benchmark_value(benchmark_context, "pay_roi", "p25", 1.0)
  refund_p75 = _benchmark_value(benchmark_context, "refund_rate_1h", "p75", 0.1)
  acceptance = live_acceptance or {}
  watch_to_pay = _number(acceptance, "watch_to_pay_rate_user", "watch_to_pay_rate_count")
  product_click_rate = _number(acceptance, "product_click_rate_user", "product_click_rate_count")
  click_to_pay = _number(acceptance, "click_to_pay_rate_user", "click_to_pay_rate_count")
  has_acceptance = bool(acceptance) and str(acceptance.get("acceptance_quality_status") or "") != "missing"

  evidence = [
    _evidence("total_impressions", "曝光规模", impressions, ">= 1000", impressions >= 1000, "dwd.marketing_content_qianchuan_material_performance_di", "判断直播引流素材是否已获得足够测试流量。"),
    _evidence("video_complete_play_rate", "视频完播率", complete_rate, _lower_bound_label("video_complete_play_rate", complete_p25, ">= 12%"), complete_rate >= complete_p25, "dwd.marketing_content_qianchuan_material_performance_di", "判断视频是否能支撑完整卖点表达。"),
    _evidence("play_rate_5s", "5秒留存", play_5s, _lower_bound_label("play_rate_5s", play_5s_p25, ">= 35%"), play_5s >= play_5s_p25, "dwd.marketing_content_qianchuan_material_performance_di", "判断前 5 秒钩子是否足够把人留到进房理由出现。"),
    _evidence("ctr", "进房意图点击率", ctr, _lower_bound_label("ctr", ctr_p25, ">= 1.2%"), ctr >= ctr_p25, "dwd.marketing_content_qianchuan_material_performance_di", "判断素材是否能明确给出进入直播间的理由。"),
    _evidence("product_click_rate_user", "直播间商品点击率", product_click_rate, _lower_bound_label("product_click_rate_user", product_click_p25, ">= 8%"), product_click_rate >= product_click_p25, "dws.marketing_content_qianchuan_live_room_acceptance_di", "账号日期级承接环境：判断进房后货盘/讲解是否带动商品点击。"),
    _evidence("watch_to_pay_rate_user", "直播间观看-成交率", watch_to_pay, _lower_bound_label("watch_to_pay_rate_user", watch_to_pay_p25, ">= 1.5%"), watch_to_pay >= watch_to_pay_p25, "dws.marketing_content_qianchuan_live_room_acceptance_di", "账号日期级承接环境：判断直播间是否把观看人群转为成交。"),
    _evidence("click_to_pay_rate_user", "直播间点击-成交率", click_to_pay, _lower_bound_label("click_to_pay_rate_user", click_to_pay_p25, ">= 5%"), click_to_pay >= click_to_pay_p25, "dws.marketing_content_qianchuan_live_room_acceptance_di", "账号日期级承接环境：判断商品点击后的价格、信任和成交承接。"),
    _evidence("pay_roi", "投流成交 ROI", roi, _lower_bound_label("pay_roi", roi_p25, ">= 1.0"), roi >= roi_p25, "dwd.marketing_content_qianchuan_material_performance_di", "仅作直播引流素材投流效率观察，不替代直播间精确归因。"),
    _evidence("refund_rate_1h", "1小时退款率", refund_rate, _upper_bound_label("refund_rate_1h", refund_p75, "<= 10%"), refund_rate <= refund_p75, "dwd.marketing_content_qianchuan_material_performance_di", "识别直播承诺、货品预期或人群错配带来的早退风险。"),
  ]

  if sample_status != "ok":
    stage = "insufficient_data"
    owner = "data_sample"
  elif complete_rate < complete_p25:
    stage = "video_hook_weak"
    owner = "creative"
  elif max(play_5s, play_10s) < play_5s_p25:
    stage = "video_hook_weak"
    owner = "creative"
  elif ctr < ctr_p25:
    stage = "live_entry_intent_weak"
    owner = "creative_or_targeting"
  elif not has_acceptance:
    stage = "missing_live_acceptance"
    owner = "data_linkage"
  elif product_click_rate < product_click_p25:
    stage = "live_product_offer_weak"
    owner = "live_room_offer"
  elif click_to_pay < click_to_pay_p25:
    stage = "pricing_trust_weak"
    owner = "live_room_offer"
  elif watch_to_pay < watch_to_pay_p25:
    stage = "live_room_acceptance_weak"
    owner = "live_room"
  elif refund_rate > refund_p75:
    stage = "live_refund_risk_high"
    owner = "product_or_after_sales"
  elif roi < roi_p25:
    stage = "pricing_trust_weak"
    owner = "live_room_offer"
  else:
    stage = "live_scale_candidate"
    owner = "growth"

  return _diagnosis_payload(
    objective=LIVE_OBJECTIVE,
    verdict=_stage_verdict(stage, scale_stage="live_scale_candidate"),
    problem_stage=stage,
    root_cause_owner=owner,
    evidence=evidence,
    good_points=_good_points(evidence),
    bad_points=_bad_points(evidence),
    next_actions=_live_actions(stage, evidence),
    sample_quality_status=sample_status,
    sample_gate=sample_gate,
    benchmark_context=benchmark_context,
    extra={
      "live_acceptance_attribution": {
        "level": "account_date_environment",
        "confidence": "medium" if has_acceptance else "low",
        "source": "dws.marketing_content_qianchuan_live_room_acceptance_di",
        "limitation": "直播间成交数据为账号/日期级承接环境，不代表单 material_id 的精确成交贡献。",
      },
      "has_live_acceptance": has_acceptance,
    },
  )


def _diagnosis_payload(
  *,
  objective: str,
  verdict: str,
  problem_stage: str,
  root_cause_owner: str,
  evidence: list[MetricEvidence],
  good_points: list[str],
  bad_points: list[str],
  next_actions: list[Mapping[str, Any]],
  sample_quality_status: str,
  sample_gate: Mapping[str, Any],
  benchmark_context: Mapping[str, Any],
  extra: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
  evidence_items = [item.to_dict() for item in evidence]
  payload: dict[str, Any] = {
    "analysis_schema_version": "2.1",
    "diagnosis_mode": "insufficient_data" if sample_quality_status != "ok" else "data_only",
    "delivery_mode": DELIVERY_MODE,
    "objective": objective,
    "verdict": verdict,
    "problem_stage": problem_stage,
    "root_cause_owner_by_data": root_cause_owner,
    "sample_quality_status": sample_quality_status,
    "sample_gate": sample_gate,
    "benchmark_context": benchmark_context,
    "diagnosis_confidence": _diagnosis_confidence(sample_quality_status),
    "good_points": good_points,
    "bad_points": bad_points,
    "metric_evidence": evidence_items,
    "evidence_ledger": evidence_items,
    "next_actions": next_actions,
  }
  if extra:
    payload.update(extra)
  return payload


def _product_actions(
  stage: str,
  evidence: list[MetricEvidence],
  *,
  missing_product_card_acceptance: bool = False,
) -> list[dict[str, Any]]:
  if stage == "product_conversion_weak" and missing_product_card_acceptance:
    return [_action(
      "data_linkage",
      "check_product_card",
      "high",
      "补齐 material_id -> product_id 商品卡承接桥接，再判断点击后成交弱点。",
      "点击后成交弱，但缺可信商品卡承接对齐，不能把 CVR 弱直接归因为商品卡或单 material_id GMV。",
      "补齐 product_id、日期窗口和 source_level1 对齐后再复盘商品卡承接。",
      _evidence_refs_for(evidence, ["cvr", "pay_roi"], fallback=["metric:cvr"]),
    )]
  actions = {
    "traffic_scale_weak": _action("media_buying", "adjust_targeting", "medium", "先补测试预算或放宽定向，确认素材是否有足够曝光样本。", "曝光不足，当前判断只能作为早期信号。", "曝光、点击、消耗达到样本门槛后再判断素材优劣。", ["metric:total_impressions"]),
    "creative_click_weak": _action("creative", "rewrite_hook", "high", "重剪前三秒：痛点/结果前置，首屏必须出现产品利益点和强对比画面。", "点击率偏弱，优先说明首屏钩子或卖点表达没有推动商品卡点击。", "提升 CTR 和有效点击量。", ["metric:ctr"]),
    "product_conversion_weak": _action("product_offer", "strengthen_selling_point", "high", "补价格机制、利益点、信任背书和明确购买理由，减少只种草不成交。", "点击后成交弱，优先排查商品利益点、信任背书和价格承接。", "提升 CVR、订单数和支付 ROI。", ["metric:cvr", "metric:pay_roi"]),
    "cost_efficiency_weak": _action("media_buying", "pause_or_reduce_budget", "medium", "保留素材方向但收窄投放人群，拆低成本版本测试 ROI。", "支付 ROI 未达基础线，先控预算再复测成本效率。", "改善 pay ROI 和 order cost。", ["metric:pay_roi"]),
    "net_settlement_weak": _action("fulfillment_or_after_sales", "check_refund_expectation", "medium", "复盘售后、履约和退款原因，避免只看支付 ROI。", "净成交/结算承接偏弱，可能不是创意本身问题。", "改善净 GMV ROI 和结算率。", _evidence_refs_for(evidence, ["net_gmv_roi", "net_gmv_settlement_rate"], fallback=["metric:refund_rate_1h"])),
    "refund_risk_high": _action("product_offer", "check_refund_expectation", "high", "检查承诺、功效表达和实际产品体验是否不一致。", "1小时退款率高会抵消支付 ROI，需先校准承诺和体验预期。", "降低退款率并稳定净成交。", ["metric:refund_rate_1h"]),
    "scale_candidate": _action("growth", "scale_budget", "medium", "保留原脚本结构，复制钩子和卖点表达，扩大预算前继续监控退款/结算。", "关键成交指标达标，可作为扩量候选。", "在保持退款/结算健康的前提下扩大消耗。", _good_evidence_refs(evidence)),
  }
  return [actions.get(stage, _action("data_sample", "continue_observation", "high", "样本不足，先补齐曝光、点击和消耗后再判断创意优劣。", "未达到样本门槛，禁止强判好坏。", "达到 impressions>=1000、clicks>=30、cost>=50 后复盘。", ["metric:total_impressions"]))]


def _product_card_acceptance_attribution(
  acceptance: Mapping[str, Any] | None,
) -> dict[str, Any]:
  value = acceptance if isinstance(acceptance, Mapping) else {}
  level = str(value.get("attribution_level") or value.get("attributionLevel") or value.get("level") or "").strip()
  if level not in PRODUCT_CARD_ACCEPTANCE_KNOWN_LEVELS:
    level = "missing_card_acceptance"
  confidence = str(value.get("confidence") or "").strip()
  if confidence not in {"high", "medium", "low"}:
    if level in PRODUCT_CARD_ACCEPTANCE_ALIGNED_LEVELS:
      confidence = "medium"
    elif level == "account_date_context":
      confidence = "low"
    else:
      confidence = "low"
  return {
    "level": level,
    "confidence": confidence,
    "source": str(value.get("source") or "ods.douyin_trade_sale_card_detail_raw"),
    "bridge_source": str(value.get("bridge_source") or value.get("bridgeSource") or "ads.douyin_shortvideo_detail"),
    "qianchuan_source": str(value.get("qianchuan_source") or value.get("qianchuanSource") or "ods.douyin_qianchuan_shortvideo_raw"),
    "qianchuan_grain": str(value.get("qianchuan_grain") or value.get("qianchuanGrain") or "material_id + stat_date"),
    "source_grain": str(value.get("source_grain") or value.get("sourceGrain") or "shop_id + stat_date + product_id + source_level1"),
    "required_bridge": str(value.get("required_bridge") or value.get("requiredBridge") or "trusted material_id -> product_id"),
    "limitation": str(
      value.get("limitation")
      or "商品卡承接不是 material_id 直连；缺可信 product_id、日期窗口和 source_level1 对齐时，不能归因到单 material_id 的商品卡 GMV。"
    ),
  }


def _live_actions(stage: str, evidence: list[MetricEvidence]) -> list[dict[str, Any]]:
  actions = {
    "video_hook_weak": _action("creative", "adjust_first_3s_visual", "high", "重剪前 5 秒：主播/直播利益点前置，减少铺垫，增加强场景或强结果画面。", "留存/完播偏弱，素材未把用户带到进房理由。", "提升 5秒留存、完播率和进房点击率。", ["metric:play_rate_5s", "metric:video_complete_play_rate"]),
    "live_entry_intent_weak": _action("creative", "align_video_to_live_room_offer", "high", "强化进直播间理由：限时机制、主播权益、直播专属价格或明确互动任务。", "有播放但进房意图不足，素材需要更明确的直播间收益。", "提升 CTR 和直播间有效进房。", ["metric:ctr"]),
    "missing_live_acceptance": _action("data_linkage", "continue_observation", "high", "补齐账号/日期直播间承接数据，只把它作为承接环境，不做单素材成交归因。", "缺直播承接环境，不能把成交弱直接归因为素材。", "补齐 live acceptance 后再拆素材问题和直播间问题。", ["metric:product_click_rate_user", "metric:watch_to_pay_rate_user"]),
    "live_product_offer_weak": _action("live_room_offer", "check_live_offer", "medium", "直播间货盘、讲解顺序和商品点击入口需要优化，素材本身已能带来进房意图。", "账号日期级商品点击弱，问题更可能在货盘或讲解承接。", "提升直播间商品点击率。", ["metric:product_click_rate_user"]),
    "live_room_acceptance_weak": _action("live_room", "check_live_room_script", "high", "人群已进房但成交弱，优先复盘主播话术、价格机制和信任承接。", "观看到成交链路偏弱，不能只改素材。", "提升 watch-to-pay 和 click-to-pay。", ["metric:watch_to_pay_rate_user"]),
    "pricing_trust_weak": _action("live_room_offer", "check_offer_price", "medium", "优化直播间价格锚点、优惠解释和背书，避免进房后信任不足。", "商品点击后的成交承接偏弱，优先检查价格机制和信任解释。", "提升 click-to-pay、ROI 和成交转化。", ["metric:click_to_pay_rate_user", "metric:pay_roi"]),
    "live_refund_risk_high": _action("product_offer", "check_refund_expectation", "high", "检查直播间承诺与产品体验，降低夸张表达和错配人群。", "早退风险高，需校准直播承诺与真实体验。", "降低退款率并稳定净成交。", ["metric:refund_rate_1h"]),
    "live_scale_candidate": _action("growth", "scale_budget", "medium", "保留该进房素材结构，扩量时联动直播间承接指标监控。", "素材与承接指标均具备基础放量信号。", "扩大进房规模，同时监控承接和退款。", _good_evidence_refs(evidence)),
  }
  return [actions.get(stage, _action("data_sample", "continue_observation", "high", "样本不足，先补齐曝光、点击、进房和直播承接数据。", "未达到样本门槛，禁止强判好坏。", "达到 impressions>=1000、clicks>=30、cost>=50 后复盘。", ["metric:total_impressions"]))]


def _good_points(evidence: list[MetricEvidence]) -> list[str]:
  return [f"{item.label}达标（{item.value}）" for item in evidence if item.judgment == "good"][:4]


def _bad_points(evidence: list[MetricEvidence]) -> list[str]:
  return [f"{item.label}偏弱（{item.value}，参考 {item.benchmark}）" for item in evidence if item.judgment == "weak"][:4]


def _evidence(
  key: str,
  label: str,
  value: float,
  benchmark: str,
  is_good: bool,
  source: str,
  meaning: str,
) -> MetricEvidence:
  return MetricEvidence(
    key=key,
    label=label,
    value=round(value, 6) if isinstance(value, float) else value,
    benchmark=benchmark,
    judgment="good" if is_good else "weak",
    source=source,
    meaning=meaning,
  )


def _sample_gate(impressions: float, clicks: float, cost: float) -> dict[str, Any]:
  thresholds = {
    "total_impressions": {"label": "曝光规模", "minimum": 1000, "value": impressions},
    "total_clicks": {"label": "点击量", "minimum": 30, "value": clicks},
    "total_cost": {"label": "消耗", "minimum": 50, "value": cost},
  }
  failed = [
    {
      "metric": key,
      "label": item["label"],
      "value": item["value"],
      "minimum": item["minimum"],
      "meaning": "低于样本门槛时只输出早期观察，不输出强好坏判断。",
    }
    for key, item in thresholds.items()
    if float(item["value"]) < float(item["minimum"])
  ]
  return {
    "status": "insufficient_sample" if failed else "ok",
    "observed": {
      "total_impressions": impressions,
      "total_clicks": clicks,
      "total_cost": cost,
    },
    "minimums": {key: item["minimum"] for key, item in thresholds.items()},
    "failed_thresholds": failed,
    "decision": "early_signal_only" if failed else "allow_directional_verdict",
  }


def _benchmark_context(
  objective: str,
  metrics: Mapping[str, Any],
  sample_gate: Mapping[str, Any],
) -> dict[str, Any]:
  provided = metrics.get("benchmark_context") or metrics.get("benchmarkContext")
  if isinstance(provided, Mapping):
    context = dict(provided)
    context.setdefault("objective", objective)
    context.setdefault("sample_status", sample_gate.get("status"))
    context.setdefault("sample", sample_gate.get("observed"))
    context.setdefault("source", "provided benchmark context")
    context.setdefault("note", "动态 benchmark 由上游快照注入。")
    return context
  return {
    "objective": objective,
    "scope": "objective_static_threshold",
    "status": "static_fallback",
    "window_days": int(_number(metrics, "active_days")) or None,
    "source": "performance_diagnostics.py static thresholds v1",
    "sample_status": sample_gate.get("status"),
    "sample": sample_gate.get("observed"),
    "note": "当前无动态同品类 benchmark 输入，阈值用于方向性诊断，前端必须显性展示该 fallback。",
  }


def _benchmark_value(
  benchmark_context: Mapping[str, Any],
  metric: str,
  quantile: str,
  default: float,
) -> float:
  metrics = benchmark_context.get("metrics")
  if not isinstance(metrics, Mapping):
    return default
  metric_context = metrics.get(metric)
  if not isinstance(metric_context, Mapping):
    return default
  value = metric_context.get(quantile) or metric_context.get(quantile.upper())
  try:
    return float(value)
  except (TypeError, ValueError):
    return default


def _lower_bound_label(metric: str, value: float, fallback: str) -> str:
  if value <= 0:
    return fallback
  return f">= P25 {_format_threshold(metric, value)}"


def _upper_bound_label(metric: str, value: float, fallback: str) -> str:
  if value <= 0:
    return fallback
  return f"<= P75 {_format_threshold(metric, value)}"


def _format_threshold(metric: str, value: float) -> str:
  if "rate" in metric or metric in {"ctr", "cvr"}:
    return f"{round(value * 100, 2)}%"
  return str(round(value, 4))


def _stage_verdict(stage: str, *, scale_stage: str) -> str:
  if stage == "insufficient_data":
    return "insufficient_data"
  if stage == scale_stage:
    return "good"
  return "needs_iteration"


def _diagnosis_confidence(sample_quality_status: str) -> float:
  return 0.35 if sample_quality_status != "ok" else 0.72


def _action(
  owner: str,
  action_type: str,
  priority: str,
  action: str,
  reason: str,
  expected_metric_lift: str,
  evidence_refs: list[str],
) -> dict[str, Any]:
  if action_type not in CANONICAL_ACTION_TYPES:
    raise ValueError(f"Unsupported content asset action_type: {action_type}")
  return {
    "title": action,
    "action": action,
    "detail": reason,
    "reason": reason,
    "owner": owner,
    "action_type": action_type,
    "priority": priority,
    "expected_metric_lift": expected_metric_lift,
    "metric_target": expected_metric_lift,
    "evidence_refs": evidence_refs,
  }


def _good_evidence_refs(evidence: list[MetricEvidence]) -> list[str]:
  refs = [f"metric:{item.key}" for item in evidence if item.judgment == "good"]
  return refs[:4] or ["metric:total_impressions"]


def _evidence_refs_for(
  evidence: list[MetricEvidence],
  keys: list[str],
  *,
  fallback: list[str],
) -> list[str]:
  wanted = set(keys)
  refs = [f"metric:{item.key}" for item in evidence if item.key in wanted and item.judgment == "weak"]
  return refs or fallback


def _number(metrics: Mapping[str, Any], *keys: str) -> float:
  for key in keys:
    value = metrics.get(key)
    if value is None:
      continue
    try:
      return float(value)
    except (TypeError, ValueError):
      continue
  return 0.0


def _has_number(metrics: Mapping[str, Any], *keys: str) -> bool:
  for key in keys:
    value = metrics.get(key)
    if value is None:
      continue
    try:
      float(value)
      return True
    except (TypeError, ValueError):
      continue
  return False
