from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.queue_processor import process_content_asset_jobs  # noqa: E402


def main() -> None:
  parser = argparse.ArgumentParser(description="Process queued marketing content asset preview/cover jobs.")
  parser.add_argument(
    "--limit",
    type=int,
    default=int(os.getenv("CONTENT_ASSET_PROCESS_LIMIT", "10") or "10"),
    help="最多处理多少个资产批次，默认读取 CONTENT_ASSET_PROCESS_LIMIT 或 10。",
  )
  parser.add_argument(
    "--temp-dir",
    default=os.getenv("CONTENT_ASSET_PROCESS_TEMP_DIR", ""),
    help="临时下载与 FFmpeg 输出目录；默认使用系统临时目录。",
  )
  args = parser.parse_args()
  temp_root = Path(args.temp_dir).expanduser().resolve() if args.temp_dir else None
  result = process_content_asset_jobs(limit=args.limit, temp_root=temp_root)
  print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
