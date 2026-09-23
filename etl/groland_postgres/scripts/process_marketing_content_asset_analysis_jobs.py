from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.analysis_processor import (  # noqa: E402
  enqueue_analysis_jobs,
  load_env_file,
  process_content_asset_analysis_jobs,
)
from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig  # noqa: E402


DEFAULT_SMOKE_IMAGE_URL = "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"


def main() -> None:
  parser = argparse.ArgumentParser(description="Process queued marketing content asset AI analysis jobs.")
  parser.add_argument(
    "--limit",
    type=int,
    default=int(os.getenv("CONTENT_ASSET_ANALYSIS_LIMIT", "10") or "10"),
    help="最多处理或排队多少条 analysis 任务，默认读取 CONTENT_ASSET_ANALYSIS_LIMIT 或 10。",
  )
  parser.add_argument(
    "--temp-dir",
    default=os.getenv("CONTENT_ASSET_PROCESS_TEMP_DIR", ""),
    help="临时分析 JSON 输出目录；默认使用系统临时目录。",
  )
  parser.add_argument(
    "--env-file",
    action="append",
    default=[],
    help="加载本机私有 env 文件，可重复传入；默认加载 .env.local 和 .env.content-assets.local。",
  )
  parser.add_argument("--enqueue", action="store_true", help="为可分析素材创建 analysis 队列任务。")
  parser.add_argument(
    "--source",
    choices=["preview", "raw", "auto"],
    default=os.getenv("CONTENT_ASSET_ANALYSIS_SOURCE", "preview") or "preview",
    help="排队任务使用的视频来源：preview 为低成本快速分析，raw 为原片完整分析，auto 为 preview 优先后 raw。",
  )
  parser.add_argument(
    "--profile",
    choices=["preview_fast", "raw_deep", "action_detail"],
    default=os.getenv("CONTENT_ASSET_ANALYSIS_PROFILE", "") or "",
    help="可选：覆盖 worker 分析 profile；默认按 source 自动选择。",
  )
  parser.add_argument(
    "--asset-id",
    default=os.getenv("CONTENT_ASSET_ANALYSIS_ASSET_ID", "") or "",
    help="可选：只为指定 asset_id 排队，便于单条 smoke / 回归验证。",
  )
  parser.add_argument("--force", action="store_true", help="排队时忽略已有 ai_summary/analysis_object_key。")
  parser.add_argument("--dry-run", action="store_true", help="只打印将排队的素材，不写数据库。")
  parser.add_argument("--smoke-image", action="store_true", help="用 Ark 官方 demo 图片验证 Responses API 连通性。")
  parser.add_argument("--smoke-image-url", default=DEFAULT_SMOKE_IMAGE_URL, help="smoke 测试图片 URL。")
  args = parser.parse_args()

  env_files = args.env_file or [".env.local", ".env.content-assets.local"]
  for env_file in env_files:
    load_env_file(Path(env_file))

  if args.smoke_image:
    client = ArkResponsesClient(ArkResponsesConfig.from_env())
    result = client.smoke_image(args.smoke_image_url)
    print(json.dumps({
      "ok": True,
      "model": client.config.model,
      "responseId": result.response_id,
      "usage": result.usage,
      "textPreview": result.text[:200],
    }, ensure_ascii=False, indent=2))
    return

  if args.enqueue:
    result = enqueue_analysis_jobs(
      limit=args.limit,
      force=args.force,
      dry_run=args.dry_run,
      source=args.source,
      profile=args.profile,
      asset_id=args.asset_id,
    )
  else:
    temp_root = Path(args.temp_dir).expanduser().resolve() if args.temp_dir else None
    result = process_content_asset_analysis_jobs(limit=args.limit, temp_root=temp_root)
  print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
