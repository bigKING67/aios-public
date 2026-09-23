from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from live_center_analysis.processor import (  # noqa: E402
  inspect_queued_analysis_jobs,
  load_env_file,
  process_douyin_live_center_analysis_jobs,
  recover_douyin_live_center_analysis_job,
)


def main() -> None:
  parser = argparse.ArgumentParser(description="Process queued Douyin live-center recording AI analysis jobs.")
  parser.add_argument(
    "--limit",
    type=int,
    default=int(os.getenv("DOUYIN_LIVE_ANALYSIS_LIMIT", "10") or "10"),
    help="最多处理多少条 analysis 任务，默认读取 DOUYIN_LIVE_ANALYSIS_LIMIT 或 10。",
  )
  parser.add_argument(
    "--env-file",
    action="append",
    default=[],
    help="加载本机私有 env 文件，可重复传入；默认加载 .env.local 和 .env.live-center.local。",
  )
  parser.add_argument("--dry-run", action="store_true", help="只查看 queued 候选任务，不领取、不写数据库。")
  parser.add_argument(
    "--recover-analysis-id",
    default="",
    help="显式恢复一条已卡在 running 且已有 input_snapshot 的分析任务；复用已生成输入，走 text-only recovery。",
  )
  args = parser.parse_args()

  if args.dry_run and args.recover_analysis_id:
    parser.error("--dry-run 不能与 --recover-analysis-id 同时使用")

  env_files = args.env_file or [".env.local", ".env.live-center.local", ".env.content-assets.local"]
  for env_file in env_files:
    load_env_file(Path(env_file))

  if args.dry_run:
    result = inspect_queued_analysis_jobs(limit=args.limit)
  elif args.recover_analysis_id:
    result = recover_douyin_live_center_analysis_job(args.recover_analysis_id)
  else:
    result = process_douyin_live_center_analysis_jobs(limit=args.limit)
  print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
