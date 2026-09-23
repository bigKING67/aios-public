from __future__ import annotations

import json
from typing import Any, Dict, Mapping


SUPPORTED_INDUSTRY_MATERIAL_BRANDS = (
  "卡诗",
  "欧莱雅PRO",
  "韩束",
  "OKCS",
  "EHD",
  "SPES",
  "馥绿德雅",
  "Off&Relax",
)
BRAND_RESOLUTION_STATUSES = ("recognized", "ambiguous", "unknown")
BRAND_RESOLUTION_SOURCES = ("title", "metadata", "visual", "transcript", "multimodal")
AUTO_RECOGNIZE_THRESHOLD = 0.9
MAX_EVIDENCE_ITEMS = 8
MAX_ALTERNATIVES = 3


class BrandResolutionContractError(ValueError):
  pass


def build_brand_resolution_prompt(asset_context: Mapping[str, Any]) -> str:
  context_json = json.dumps(asset_context, ensure_ascii=False, indent=2)
  brand_options = "、".join(SUPPORTED_INDUSTRY_MATERIAL_BRANDS)
  return f"""你是 Groland 行业素材品牌识别器。只判断视频是否明确展示或提及以下固定品牌：{brand_options}。

业务档案：
{context_json}

按以下证据优先级判断：
1. 产品包装、Logo、固定水印或画面 OCR 中的明确品牌文字。
2. 标题、商品、卖点、创作者或 transcript 中的明确品牌全称/受控别名。
3. 画面与文本两类证据一致时可提高置信度。

禁止事项：
- 不得因为染发、防脱、干发喷雾、洗发水等品类或功效猜品牌。
- 不得输出固定品牌列表以外的品牌。
- 竞品对比、同时出现多个品牌或证据冲突时必须输出 ambiguous。
- 没有明确品牌证据时输出 unknown，不要强行补齐。
- evidence 最多 {MAX_EVIDENCE_ITEMS} 条，只保留短证据，不要输出逐帧描述或大段脚本。

只返回符合 JSON Schema 的 JSON 对象，不要 Markdown 或解释。"""


def brand_resolution_json_schema() -> Dict[str, Any]:
  return {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "brand",
      "status",
      "confidence",
      "primarySource",
      "evidence",
      "alternatives",
    ],
    "properties": {
      "brand": {
        "type": "string",
        "enum": [*SUPPORTED_INDUSTRY_MATERIAL_BRANDS, "unknown"],
      },
      "status": {"type": "string", "enum": list(BRAND_RESOLUTION_STATUSES)},
      "confidence": {"type": "number", "minimum": 0, "maximum": 1},
      "primarySource": {"type": "string", "enum": list(BRAND_RESOLUTION_SOURCES)},
      "evidence": {
        "type": "array",
        "maxItems": MAX_EVIDENCE_ITEMS,
        "items": {
          "type": "object",
          "additionalProperties": False,
          "required": ["source", "kind", "text", "timeRange"],
          "properties": {
            "source": {"type": "string", "maxLength": 40},
            "kind": {"type": "string", "maxLength": 40},
            "text": {"type": "string", "maxLength": 160},
            "timeRange": {"type": "string", "maxLength": 40},
          },
        },
      },
      "alternatives": {
        "type": "array",
        "maxItems": MAX_ALTERNATIVES,
        "items": {"type": "string", "enum": list(SUPPORTED_INDUSTRY_MATERIAL_BRANDS)},
      },
    },
  }


def normalize_brand_resolution(value: Mapping[str, Any]) -> Dict[str, Any]:
  if not isinstance(value, Mapping):
    raise BrandResolutionContractError("品牌解析结果必须是对象")

  raw_brand = _required_text(value, "brand")
  status = _required_text(value, "status")
  source = _required_text(value, "primarySource")
  confidence = _confidence(value.get("confidence"))
  if status not in BRAND_RESOLUTION_STATUSES:
    raise BrandResolutionContractError(f"不支持的品牌解析状态: {status}")
  if source not in BRAND_RESOLUTION_SOURCES:
    raise BrandResolutionContractError(f"不支持的品牌证据来源: {source}")
  if raw_brand != "unknown" and raw_brand not in SUPPORTED_INDUSTRY_MATERIAL_BRANDS:
    raise BrandResolutionContractError(f"不支持的品牌: {raw_brand}")

  evidence = _normalize_evidence(value.get("evidence"))
  alternatives = _normalize_alternatives(value.get("alternatives"))
  brand = None if raw_brand == "unknown" else raw_brand
  if status == "recognized" and brand is None:
    raise BrandResolutionContractError("recognized 状态必须包含固定品牌")
  if status != "recognized" and brand is not None:
    raise BrandResolutionContractError("ambiguous/unknown 状态不得确认品牌")
  if status == "recognized" and not evidence:
    raise BrandResolutionContractError("recognized 状态必须包含显式证据")

  if status == "recognized" and confidence < AUTO_RECOGNIZE_THRESHOLD:
    alternatives = _dedupe([brand, *alternatives], MAX_ALTERNATIVES)
    status = "ambiguous"
    brand = None

  return {
    "brand": brand,
    "status": status,
    "confidence": confidence,
    "primarySource": source,
    "evidence": evidence,
    "alternatives": alternatives,
  }


def _required_text(value: Mapping[str, Any], key: str) -> str:
  text = str(value.get(key) or "").strip()
  if not text:
    raise BrandResolutionContractError(f"品牌解析结果缺少 {key}")
  return text


def _confidence(value: Any) -> float:
  try:
    confidence = float(value)
  except (TypeError, ValueError) as error:
    raise BrandResolutionContractError("品牌解析 confidence 必须是 0 到 1 的数字") from error
  if not 0 <= confidence <= 1:
    raise BrandResolutionContractError("品牌解析 confidence 必须在 0 到 1 之间")
  return confidence


def _normalize_evidence(value: Any) -> list[dict[str, str]]:
  if not isinstance(value, list):
    raise BrandResolutionContractError("品牌解析 evidence 必须是数组")
  if len(value) > MAX_EVIDENCE_ITEMS:
    raise BrandResolutionContractError(f"品牌解析 evidence 最多 {MAX_EVIDENCE_ITEMS} 条")
  normalized: list[dict[str, str]] = []
  for item in value:
    if not isinstance(item, Mapping):
      raise BrandResolutionContractError("品牌解析 evidence 项必须是对象")
    row = {
      "source": str(item.get("source") or "").strip()[:40],
      "kind": str(item.get("kind") or "").strip()[:40],
      "text": str(item.get("text") or "").strip()[:160],
      "timeRange": str(item.get("timeRange") or "").strip()[:40],
    }
    if not row["source"] or not row["kind"] or not row["text"]:
      raise BrandResolutionContractError("品牌解析 evidence 缺少 source/kind/text")
    normalized.append(row)
  return normalized


def _normalize_alternatives(value: Any) -> list[str]:
  if not isinstance(value, list):
    raise BrandResolutionContractError("品牌解析 alternatives 必须是数组")
  normalized = [str(item).strip() for item in value if str(item).strip()]
  unsupported = [item for item in normalized if item not in SUPPORTED_INDUSTRY_MATERIAL_BRANDS]
  if unsupported:
    raise BrandResolutionContractError(f"alternatives 包含不支持品牌: {unsupported[0]}")
  return _dedupe(normalized, MAX_ALTERNATIVES)


def _dedupe(values: list[str | None], limit: int) -> list[str]:
  result: list[str] = []
  for value in values:
    if value and value not in result:
      result.append(value)
    if len(result) >= limit:
      break
  return result
