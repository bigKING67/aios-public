from __future__ import annotations

import os
from typing import Any, Callable, Mapping

from .ark_json_parser import parse_analysis_json
from .brand_resolution_contract import (
  brand_resolution_json_schema,
  build_brand_resolution_prompt,
  normalize_brand_resolution,
)


DEFAULT_CONTENT_ASSET_BRAND_RESOLUTION_PROMPT_VERSION = "v1"


def request_video_brand_resolution(
  post: Callable[[dict[str, Any]], dict[str, Any]],
  extract_output_text: Callable[[dict[str, Any]], str],
  error_type: type[RuntimeError],
  config: Any,
  video_url: str,
  asset_context: Mapping[str, Any],
) -> dict[str, Any]:
  fps = min(config.preview_profile.fps, 1.0)
  if fps < 0.2:
    raise error_type("Ark video fps must be between 0.2 and 5")
  prompt_version = (
    os.getenv("CONTENT_ASSET_BRAND_RESOLUTION_PROMPT_VERSION")
    or DEFAULT_CONTENT_ASSET_BRAND_RESOLUTION_PROMPT_VERSION
  ).strip()
  payload = {
    "model": config.model,
    "input": [
      {
        "role": "user",
        "content": [
          {"type": "input_video", "video_url": video_url, "fps": fps},
          {"type": "input_text", "text": build_brand_resolution_prompt(asset_context)},
        ],
      }
    ],
    "max_output_tokens": min(config.preview_profile.max_output_tokens, 1200),
    "thinking": {"type": "disabled"},
    "temperature": 0,
    "store": False,
    "text": {
      "format": {
        "type": "json_schema",
        "name": "industry_material_brand_resolution",
        "strict": True,
        "schema": brand_resolution_json_schema(),
      }
    },
  }
  response = post(payload)
  output_text = extract_output_text(response)
  analysis = normalize_brand_resolution(parse_analysis_json(output_text, error_type))
  return {
    "text": output_text,
    "analysis": analysis,
    "raw_response": response,
    "request_settings": {
      "analysis_profile": "brand_resolution_fast",
      "max_output_tokens": payload["max_output_tokens"],
      "fps": fps,
      "thinking_type": "disabled",
      "temperature": 0,
      "json_schema_strict": True,
      "store_response": False,
      "model": config.model,
      "prompt_version": prompt_version,
    },
  }
