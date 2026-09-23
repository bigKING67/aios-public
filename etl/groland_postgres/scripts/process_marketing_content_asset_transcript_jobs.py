from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.transcript_processor import (  # noqa: E402
  enqueue_transcript_jobs,
  load_env_file,
  process_content_asset_transcript_jobs,
)


def main() -> None:
  parser = argparse.ArgumentParser(description="Process queued marketing content asset transcript/SRT jobs.")
  parser.add_argument(
    "--limit",
    type=int,
    default=int(os.getenv("CONTENT_ASSET_TRANSCRIPT_LIMIT", "10") or "10"),
    help="最多处理或排队多少条 transcript 任务，默认读取 CONTENT_ASSET_TRANSCRIPT_LIMIT 或 10。",
  )
  parser.add_argument(
    "--temp-dir",
    default=os.getenv("CONTENT_ASSET_PROCESS_TEMP_DIR", ""),
    help="临时 transcript JSON 输出目录；默认使用系统临时目录。",
  )
  parser.add_argument(
    "--env-file",
    action="append",
    default=[],
    help="加载本机私有 env 文件，可重复传入；默认加载 .env.local 和 .env.content-assets.local。",
  )
  parser.add_argument("--enqueue", action="store_true", help="为可转写素材创建 transcript 队列任务。")
  parser.add_argument(
    "--source",
    choices=["raw", "preview", "auto"],
    default=os.getenv("CONTENT_ASSET_TRANSCRIPT_SOURCE", "auto") or "auto",
    help="脚本抽取来源：auto 为 raw 优先再 preview；raw 使用原片；preview 使用预览视频。",
  )
  parser.add_argument(
    "--asset-id",
    default=os.getenv("CONTENT_ASSET_TRANSCRIPT_ASSET_ID", "") or "",
    help="可选：只为指定 asset_id 排队，便于单条 smoke / 回归验证。",
  )
  parser.add_argument("--force", action="store_true", help="排队时忽略已有 transcript_object_key。")
  parser.add_argument("--dry-run", action="store_true", help="只打印将排队的素材，不写数据库。")
  args = parser.parse_args()

  env_files = args.env_file or [".env.local", ".env.content-assets.local"]
  for env_file in env_files:
    load_env_file(Path(env_file))

  if args.enqueue:
    result = enqueue_transcript_jobs(
      limit=args.limit,
      force=args.force,
      dry_run=args.dry_run,
      source=args.source,
      asset_id=args.asset_id,
    )
  else:
    temp_root = Path(args.temp_dir).expanduser().resolve() if args.temp_dir else None
    result = process_content_asset_transcript_jobs(limit=args.limit, temp_root=temp_root)
  print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
