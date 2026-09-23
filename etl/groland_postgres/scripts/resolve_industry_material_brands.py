from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.brand_resolution_processor import (  # noqa: E402
  DEFAULT_RESOLVER_VERSION,
  MAX_BATCH_LIMIT,
  SUPPORTED_VIDEO_TYPES,
  resolve_industry_material_brands,
)
from marketing_content_assets.worker_runtime import load_env_file  # noqa: E402


def main() -> int:
  parser = argparse.ArgumentParser(
    description="Resolve fixed-scope industry material brands from metadata and narrow video evidence."
  )
  parser.add_argument("--month", default="", help="目标月份，格式 YYYY-MM；未指定 asset 时必填。")
  parser.add_argument("--video-type", default="", choices=SUPPORTED_VIDEO_TYPES, help="未指定 asset 时必填。")
  parser.add_argument("--asset-id", default="", help="可选：只处理指定 asset UUID，可省略月份和视频类型。")
  parser.add_argument("--limit", type=int, default=20, help=f"批次上限，1-{MAX_BATCH_LIMIT}，默认 20。")
  parser.add_argument("--resolver-version", default=DEFAULT_RESOLVER_VERSION)
  parser.add_argument(
    "--env-file",
    action="append",
    default=[],
    help="加载本机私有 env 文件，可重复；默认加载 .env.local 和 .env.content-assets.local。",
  )
  parser.add_argument(
    "--apply",
    action="store_true",
    help="写入版本化品牌解析结果；不传时严格 dry-run。",
  )
  parser.add_argument(
    "--allow-model-calls",
    action="store_true",
    help="允许对确定性规则仍未识别的素材调用窄多模态模型；必须同时传 --apply。",
  )
  args = parser.parse_args()
  if args.allow_model_calls and not args.apply:
    parser.error("--allow-model-calls 必须与 --apply 同时使用")

  env_files = args.env_file or [".env.local", ".env.content-assets.local"]
  for env_file in env_files:
    load_env_file(Path(env_file))

  try:
    result = resolve_industry_material_brands(
      month=args.month,
      video_type=args.video_type,
      limit=args.limit,
      resolver_version=args.resolver_version,
      asset_id=args.asset_id,
      apply=args.apply,
      allow_model_calls=args.allow_model_calls,
    )
  except (RuntimeError, ValueError) as error:
    print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, indent=2))
    return 1
  print(json.dumps({"ok": result.get("failed", 0) == 0, **result}, ensure_ascii=False, indent=2))
  return 1 if result.get("failed", 0) else 0


if __name__ == "__main__":
  raise SystemExit(main())
