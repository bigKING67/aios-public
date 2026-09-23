from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2.extras

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.asr_client import (  # noqa: E402
  infer_segment_time_scale,
  normalize_segments,
  segments_to_srt,
)
from marketing_content_assets.repository import connect_pg  # noqa: E402
from marketing_content_assets.worker_runtime import json_safe, load_env_file  # noqa: E402


def main() -> None:
  parser = argparse.ArgumentParser(
    description="修正内容素材脚本中秒值误写入 start_ms/end_ms 导致的 SRT 时间戳缩放问题。"
  )
  parser.add_argument(
    "--env-file",
    action="append",
    default=[],
    help="加载本机私有 env 文件，可重复传入；默认加载 .env.local 和 .env.content-assets.local。",
  )
  parser.add_argument(
    "--asset-id",
    default=os.getenv("CONTENT_ASSET_TRANSCRIPT_ASSET_ID", "") or "",
    help="可选：只修正指定 asset_id。",
  )
  parser.add_argument(
    "--limit",
    type=int,
    default=int(os.getenv("CONTENT_ASSET_TRANSCRIPT_REPAIR_LIMIT", "0") or "0"),
    help="最多检查多少条 active transcript；0 表示不限制。",
  )
  parser.add_argument("--apply", action="store_true", help="实际写入 DB；不传时只 dry-run。")
  args = parser.parse_args()

  env_files = args.env_file or [".env.local", ".env.content-assets.local"]
  for env_file in env_files:
    load_env_file(Path(env_file))

  with connect_pg() as conn:
    rows = query_active_transcripts(conn, asset_id=args.asset_id, limit=args.limit)
    repairs = build_repairs(rows)
    updated = apply_repairs(conn, repairs) if args.apply else 0

  print(json.dumps({
    "dryRun": not args.apply,
    "checked": len(rows),
    "candidateCount": len(repairs),
    "updated": updated,
    "sample": [repair["summary"] for repair in repairs[:10]],
  }, ensure_ascii=False, indent=2, default=json_safe))


def query_active_transcripts(
  conn: psycopg2.extensions.connection,
  *,
  asset_id: str,
  limit: int,
) -> list[dict[str, Any]]:
  asset_filter = "AND asset_id = %(asset_id)s::uuid" if asset_id else ""
  limit_clause = f"LIMIT {max(1, int(limit))}" if limit and limit > 0 else ""
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      f"""
      SELECT
        transcript_id,
        asset_id,
        duration_seconds,
        srt_text,
        segments
      FROM ads.marketing_content_asset_transcripts
      WHERE status = 'active'
        {asset_filter}
      ORDER BY created_at DESC
      {limit_clause}
      """,
      {"asset_id": asset_id},
    )
    return list(cur.fetchall())


def build_repairs(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
  repairs: list[dict[str, Any]] = []
  for row in rows:
    segments = row.get("segments")
    if not isinstance(segments, list):
      continue
    time_scale = infer_segment_time_scale(segments, duration_seconds=row.get("duration_seconds"))
    if time_scale != 1000:
      continue
    normalized_segments = normalize_segments(segments, duration_seconds=row.get("duration_seconds"))
    srt_text = segments_to_srt(normalized_segments)
    if not srt_text:
      continue
    current_srt = str(row.get("srt_text") or "")
    if normalized_segments == segments and srt_text == current_srt:
      continue
    repairs.append({
      "transcript_id": str(row["transcript_id"]),
      "asset_id": str(row["asset_id"]),
      "segments": normalized_segments,
      "srt_text": srt_text,
      "metadata": {
        "transcript_timestamp_repair": {
          "scale": time_scale,
          "reason": "seconds_values_in_start_ms_end_ms",
          "repaired_at": datetime.now(timezone.utc).isoformat(),
        }
      },
      "summary": {
        "transcriptId": str(row["transcript_id"]),
        "assetId": str(row["asset_id"]),
        "durationSeconds": row.get("duration_seconds"),
        "before": first_time_range(current_srt),
        "after": first_time_range(srt_text),
      },
    })
  return repairs


def apply_repairs(conn: psycopg2.extensions.connection, repairs: list[dict[str, Any]]) -> int:
  if not repairs:
    return 0
  with conn.cursor() as cur:
    for repair in repairs:
      cur.execute(
        """
        UPDATE ads.marketing_content_asset_transcripts
        SET segments = %s::jsonb,
            srt_text = %s,
            metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE transcript_id = %s::uuid
          AND status = 'active'
        """,
        (
          json.dumps(repair["segments"], ensure_ascii=False),
          repair["srt_text"],
          json.dumps(repair["metadata"], ensure_ascii=False),
          repair["transcript_id"],
        ),
      )
      cur.execute(
        """
        INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
        VALUES (%s::uuid, 'transcript_timestamp_repaired', 'content-assets-worker', '修正视频脚本/SRT 时间戳秒毫秒缩放', %s::jsonb)
        """,
        (
          repair["asset_id"],
          json.dumps({
            "transcriptId": repair["transcript_id"],
            "before": repair["summary"]["before"],
            "after": repair["summary"]["after"],
            "scale": repair["metadata"]["transcript_timestamp_repair"]["scale"],
          }, ensure_ascii=False),
        ),
      )
  conn.commit()
  return len(repairs)


def first_time_range(srt_text: str) -> str:
  for line in srt_text.splitlines():
    if "-->" in line:
      return line.strip()
  return ""


if __name__ == "__main__":
  main()
