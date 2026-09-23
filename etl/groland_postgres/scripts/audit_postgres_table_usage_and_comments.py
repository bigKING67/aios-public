#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


SYSTEM_SCHEMAS = ("pg_catalog", "information_schema")
RUNTIME_CATEGORIES = {"backend_src", "etl_scripts", "frontend_src", "ops_scripts"}
SKIP_DIR_NAMES = {
  ".cache",
  ".git",
  ".prefect_home",
  ".prefect_logs",
  ".venv",
  "__pycache__",
  "build",
  "dist",
  "node_modules",
  "target",
}
SKIP_PREFIXES = (".trellis/tasks/", ".trellis/workspace/")
SKIP_FILENAMES = {".env", ".env.vps", ".env.vps.swp", ".env.feishu-sync.vps"}
SKIP_SUFFIXES = {
  ".bin",
  ".db",
  ".dump",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".o",
  ".otf",
  ".pdf",
  ".png",
  ".rlib",
  ".rmeta",
  ".sqlite",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
}

TABLE_INVENTORY_SQL = """
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.oid::TEXT AS table_oid,
  pg_total_relation_size(c.oid)::BIGINT AS total_bytes,
  pg_relation_size(c.oid)::BIGINT AS table_bytes,
  COALESCE(s.n_live_tup, c.reltuples, 0)::BIGINT AS estimated_rows,
  COALESCE(s.seq_scan, 0)::BIGINT AS seq_scan,
  COALESCE(s.idx_scan, 0)::BIGINT AS idx_scan,
  (
    COALESCE(s.n_tup_ins, 0)
    + COALESCE(s.n_tup_upd, 0)
    + COALESCE(s.n_tup_del, 0)
  )::BIGINT AS writes_since_stats_reset,
  COUNT(a.attnum) FILTER (
    WHERE a.attnum > 0 AND NOT a.attisdropped
  )::INTEGER AS column_count,
  (
    COUNT(a.attnum) FILTER (
      WHERE a.attnum > 0 AND NOT a.attisdropped
    )
    - COUNT(col_description(c.oid, a.attnum)) FILTER (
      WHERE a.attnum > 0 AND NOT a.attisdropped
    )
  )::INTEGER AS missing_column_comments,
  CASE
    WHEN NULLIF(BTRIM(COALESCE(obj_description(c.oid, 'pg_class'), '')), '') IS NULL
      THEN 1
    ELSE 0
  END AS missing_table_comment,
  COALESCE(obj_description(c.oid, 'pg_class'), '') AS table_comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
LEFT JOIN pg_attribute a ON a.attrelid = c.oid
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
GROUP BY n.nspname, c.relname, c.oid, s.n_live_tup, s.seq_scan, s.idx_scan,
  s.n_tup_ins, s.n_tup_upd, s.n_tup_del
ORDER BY n.nspname, c.relname
"""

DB_REFERENCE_SQL = """
WITH tables AS (
  SELECT n.nspname AS schema_name, c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),
routines AS (
  SELECT p.oid, LOWER(pg_get_functiondef(p.oid)) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),
views AS (
  SELECT c.oid, LOWER(pg_get_viewdef(c.oid, TRUE)) AS definition
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v', 'm')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
)
SELECT
  t.schema_name,
  t.table_name,
  COUNT(DISTINCT r.oid) FILTER (
    WHERE POSITION(LOWER(t.schema_name || '.' || t.table_name) IN r.definition) > 0
  )::INTEGER AS routine_refs,
  COUNT(DISTINCT v.oid) FILTER (
    WHERE POSITION(LOWER(t.schema_name || '.' || t.table_name) IN v.definition) > 0
  )::INTEGER AS view_refs
FROM tables t
LEFT JOIN routines r ON TRUE
LEFT JOIN views v ON TRUE
GROUP BY t.schema_name, t.table_name
ORDER BY t.schema_name, t.table_name
"""

TABLE_COLUMN_COMMENT_SUMMARY_SQL = """
WITH comments AS (
  SELECT
    'table' AS object_type,
    n.nspname AS schema_name,
    obj_description(c.oid, 'pg_class') AS comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  SELECT
    'column' AS object_type,
    n.nspname AS schema_name,
    col_description(c.oid, a.attnum) AS comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND a.attnum > 0
    AND NOT a.attisdropped
)
SELECT
  schema_name,
  COUNT(*)::INTEGER AS object_count,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(COALESCE(comment, '')), '') IS NOT NULL
  )::INTEGER AS filled_comments,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(COALESCE(comment, '')), '') IS NULL
  )::INTEGER AS missing_comments,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(COALESCE(comment, '')), '') IS NOT NULL
      AND comment !~ '[一-龥]'
  )::INTEGER AS non_chinese_comments
FROM comments
GROUP BY schema_name
ORDER BY schema_name
"""

DDL_COMMENT_SUMMARY_SQL = """
WITH target_tables AS (
  SELECT c.oid, n.nspname AS schema_name, c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),
ddl_objects AS (
  SELECT
    'index' AS object_type,
    obj_description(idx.oid, 'pg_class') AS comment
  FROM target_tables tt
  JOIN pg_index ix ON ix.indrelid = tt.oid
  JOIN pg_class idx ON idx.oid = ix.indexrelid
  UNION ALL
  SELECT
    'constraint' AS object_type,
    obj_description(con.oid, 'pg_constraint') AS comment
  FROM target_tables tt
  JOIN pg_constraint con ON con.conrelid = tt.oid
  UNION ALL
  SELECT
    'trigger' AS object_type,
    obj_description(trg.oid, 'pg_trigger') AS comment
  FROM target_tables tt
  JOIN pg_trigger trg ON trg.tgrelid = tt.oid
  WHERE NOT trg.tgisinternal
),
routine_objects AS (
  SELECT
    CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS object_type,
    obj_description(p.oid, 'pg_proc') AS comment
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
)
SELECT
  object_type,
  COUNT(*)::INTEGER AS object_count,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(COALESCE(comment, '')), '') IS NOT NULL
  )::INTEGER AS filled_comments,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(COALESCE(comment, '')), '') IS NULL
  )::INTEGER AS missing_comments,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(COALESCE(comment, '')), '') IS NOT NULL
      AND comment !~ '[一-龥]'
  )::INTEGER AS non_chinese_comments
FROM (
  SELECT * FROM ddl_objects
  UNION ALL
  SELECT * FROM routine_objects
) x
GROUP BY object_type
ORDER BY object_type
"""

DATABASE_STATS_SQL = """
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  inet_server_addr()::TEXT AS server_addr,
  inet_server_port()::TEXT AS server_port,
  version() AS server_version,
  pg_postmaster_start_time()::TEXT AS postmaster_start_time,
  (
    SELECT stats_reset::TEXT
    FROM pg_stat_database
    WHERE datname = current_database()
  ) AS database_stats_reset
"""


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Audit PostgreSQL table usage evidence and DDL comment coverage.",
  )
  parser.add_argument(
    "--repo-root",
    default=str(Path(__file__).resolve().parents[3]),
    help="Repository root used for static reference scanning.",
  )
  parser.add_argument(
    "--format",
    choices=("text", "json"),
    default="text",
    help="Output format.",
  )
  parser.add_argument(
    "--output",
    default="",
    help="Optional path to write the full JSON audit result.",
  )
  parser.add_argument(
    "--skip-repo-scan",
    action="store_true",
    help="Only collect database catalog evidence.",
  )
  parser.add_argument(
    "--timeout",
    type=int,
    default=int(os.getenv("DDL_AUDIT_PSQL_TIMEOUT", "180")),
    help="Per-query psql timeout in seconds.",
  )
  return parser.parse_args()


def resolve_psql() -> str:
  configured = os.getenv("PSQL_BIN", "").strip()
  if configured:
    if Path(configured).exists():
      return configured
    raise RuntimeError(f"Configured PSQL_BIN does not exist: {configured}")

  from_path = shutil.which("psql")
  if from_path:
    return from_path

  raise RuntimeError("psql not found. Set PSQL_BIN or install PostgreSQL client tools.")


def build_pg_env() -> dict[str, str]:
  env = os.environ.copy()
  database_url = env.get("DATABASE_URL", "").strip()
  if database_url:
    parsed = urlparse(database_url)
    if parsed.scheme not in ("postgres", "postgresql"):
      raise RuntimeError(f"Unsupported DATABASE_URL scheme: {parsed.scheme}")
    if parsed.hostname:
      env["PGHOST"] = parsed.hostname
    if parsed.port:
      env["PGPORT"] = str(parsed.port)
    if parsed.username:
      env["PGUSER"] = unquote(parsed.username)
    if parsed.password:
      env["PGPASSWORD"] = unquote(parsed.password)
    database_name = parsed.path.lstrip("/").split("/", 1)[0]
    if database_name:
      env["PGDATABASE"] = database_name
    query = parse_qs(parsed.query)
    if query.get("sslmode"):
      env["PGSSLMODE"] = query["sslmode"][0]

  missing = [name for name in ("PGHOST", "PGUSER", "PGDATABASE") if not env.get(name)]
  if missing:
    raise RuntimeError(
      "Missing database connection env: "
      + ", ".join(missing)
      + ". Provide DATABASE_URL or PGHOST/PGUSER/PGDATABASE.",
    )
  env.setdefault("PGCONNECT_TIMEOUT", "20")
  return env


def run_copy_query(psql_bin: str, pg_env: dict[str, str], sql: str, timeout: int) -> list[dict[str, str]]:
  statement = (
    "BEGIN READ ONLY;\n"
    "COPY (\n"
    + sql.strip().rstrip(";")
    + "\n) TO STDOUT WITH (FORMAT csv, HEADER true, DELIMITER E'\\t');\n"
    "COMMIT;\n"
  )
  result = subprocess.run(
    [psql_bin, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-P", "pager=off"],
    input=statement,
    text=True,
    capture_output=True,
    env=pg_env,
    timeout=timeout,
    check=False,
  )
  if result.returncode != 0:
    raise RuntimeError(result.stderr.strip() or "psql query failed")

  return list(csv.DictReader(io.StringIO(result.stdout), delimiter="\t"))


def classify_path(repo_root: Path, path: Path) -> str:
  rel = path.relative_to(repo_root).as_posix()
  if rel.startswith("backend-rust/src/"):
    return "backend_src"
  if rel.startswith("etl/groland_postgres/scripts/"):
    return "etl_scripts"
  if rel.startswith("etl/groland_postgres/sql/migrations/"):
    return "migrations"
  if rel.startswith("etl/groland_postgres/tests/"):
    return "etl_tests"
  if rel.startswith("apps/web-vite/src/"):
    return "frontend_src"
  if rel.startswith("scripts/"):
    return "ops_scripts"
  if rel.startswith("docs/") or rel.endswith(".md"):
    return "docs"
  return "other"


def should_skip_file(repo_root: Path, path: Path) -> bool:
  rel = path.relative_to(repo_root).as_posix()
  if path.name in SKIP_FILENAMES or path.name.startswith(".env.vps.bak"):
    return True
  if rel.startswith(SKIP_PREFIXES):
    return True
  return path.suffix.lower() in SKIP_SUFFIXES


def iter_repo_files(repo_root: Path) -> list[Path]:
  files: list[Path] = []
  for dirpath, dirnames, filenames in os.walk(repo_root, topdown=True, followlinks=False):
    dirnames[:] = [name for name in dirnames if name not in SKIP_DIR_NAMES]
    current_dir = Path(dirpath)
    rel_dir = current_dir.relative_to(repo_root).as_posix()
    if rel_dir != "." and rel_dir.startswith(SKIP_PREFIXES):
      dirnames[:] = []
      continue

    for filename in filenames:
      path = current_dir / filename
      if not should_skip_file(repo_root, path):
        files.append(path)
  return files


def qualified_pattern(schema_name: str, table_name: str) -> re.Pattern[str]:
  qualified = f"{schema_name}.{table_name}"
  suffix = r"(?![A-Za-z0-9_])"
  if len(table_name) >= 63:
    suffix = r"[A-Za-z0-9_]*(?![A-Za-z0-9_])"
  return re.compile(r"(?<![A-Za-z0-9_])" + re.escape(qualified) + suffix, re.IGNORECASE)


def bare_pattern(table_name: str) -> re.Pattern[str]:
  return re.compile(r"(?<![A-Za-z0-9_])" + re.escape(table_name) + r"(?![A-Za-z0-9_])", re.IGNORECASE)


def empty_repo_ref() -> dict[str, Any]:
  return {
    "files": set(),
    "runtime_files": set(),
    "migration_files": set(),
    "test_files": set(),
    "doc_files": set(),
    "categories": {},
  }


def add_repo_hit(entry: dict[str, Any], category: str, rel_path: str) -> None:
  entry["files"].add(rel_path)
  entry["categories"][category] = entry["categories"].get(category, 0) + 1
  if category in RUNTIME_CATEGORIES:
    entry["runtime_files"].add(rel_path)
  elif category == "migrations":
    entry["migration_files"].add(rel_path)
  elif category == "etl_tests":
    entry["test_files"].add(rel_path)
  elif category == "docs":
    entry["doc_files"].add(rel_path)


def scan_repo_qualified_refs(repo_root: Path, tables: list[dict[str, str]]) -> dict[str, dict[str, Any]]:
  refs = {row["table_fqn"]: empty_repo_ref() for row in tables}
  patterns = {
    row["table_fqn"]: qualified_pattern(row["schema_name"], row["table_name"])
    for row in tables
  }
  tokens = {
    row["table_fqn"]: f"{row['schema_name']}.{row['table_name']}".lower()
    for row in tables
  }
  for path in iter_repo_files(repo_root):
    try:
      text = path.read_text(errors="ignore")
    except OSError:
      continue
    lowered_text = text.lower()
    rel_path = path.relative_to(repo_root).as_posix()
    category = classify_path(repo_root, path)
    for table_fqn, pattern in patterns.items():
      if tokens[table_fqn] not in lowered_text:
        continue
      if pattern.search(text):
        add_repo_hit(refs[table_fqn], category, rel_path)
  return refs


def scan_repo_bare_refs(
  repo_root: Path,
  candidate_tables: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
  refs = {row["table_fqn"]: empty_repo_ref() for row in candidate_tables}
  patterns = {row["table_fqn"]: bare_pattern(row["table_name"]) for row in candidate_tables}
  tokens = {row["table_fqn"]: row["table_name"].lower() for row in candidate_tables}
  for path in iter_repo_files(repo_root):
    try:
      text = path.read_text(errors="ignore")
    except OSError:
      continue
    lowered_text = text.lower()
    rel_path = path.relative_to(repo_root).as_posix()
    category = classify_path(repo_root, path)
    for table_fqn, pattern in patterns.items():
      if tokens[table_fqn] not in lowered_text:
        continue
      if pattern.search(text):
        add_repo_hit(refs[table_fqn], category, rel_path)
  return refs


def normalize_int(value: str | None) -> int:
  if not value:
    return 0
  return int(float(value))


def merge_evidence(
  inventory: list[dict[str, str]],
  db_refs: list[dict[str, str]],
  repo_refs: dict[str, dict[str, Any]],
  repo_root: Path | None,
) -> list[dict[str, Any]]:
  db_ref_map = {
    f"{row['schema_name']}.{row['table_name']}": row
    for row in db_refs
  }
  merged: list[dict[str, Any]] = []
  for row in inventory:
    table_fqn = f"{row['schema_name']}.{row['table_name']}"
    db_ref = db_ref_map.get(table_fqn, {})
    repo_ref = repo_refs.get(table_fqn, empty_repo_ref())
    routine_refs = normalize_int(db_ref.get("routine_refs"))
    view_refs = normalize_int(db_ref.get("view_refs"))
    runtime_files = len(repo_ref["runtime_files"])
    table = {
      "schema_name": row["schema_name"],
      "table_name": row["table_name"],
      "table_fqn": table_fqn,
      "total_bytes": normalize_int(row.get("total_bytes")),
      "estimated_rows": normalize_int(row.get("estimated_rows")),
      "seq_scan": normalize_int(row.get("seq_scan")),
      "idx_scan": normalize_int(row.get("idx_scan")),
      "writes_since_stats_reset": normalize_int(row.get("writes_since_stats_reset")),
      "column_count": normalize_int(row.get("column_count")),
      "missing_table_comment": normalize_int(row.get("missing_table_comment")),
      "missing_column_comments": normalize_int(row.get("missing_column_comments")),
      "routine_refs": routine_refs,
      "view_refs": view_refs,
      "qualified_repo_files": len(repo_ref["files"]),
      "qualified_runtime_files": runtime_files,
      "qualified_migration_files": len(repo_ref["migration_files"]),
      "qualified_test_files": len(repo_ref["test_files"]),
      "qualified_doc_files": len(repo_ref["doc_files"]),
      "qualified_ref_categories": dict(sorted(repo_ref["categories"].items())),
      "sample_runtime_files": sorted(repo_ref["runtime_files"])[:8],
      "bare_runtime_files": 0,
      "bare_ref_categories": {},
      "sample_bare_runtime_files": [],
    }
    merged.append(table)

  if repo_root is not None:
    weak_candidates = [
      table
      for table in merged
      if table["qualified_runtime_files"] == 0
      and table["routine_refs"] == 0
      and table["view_refs"] == 0
    ]
    bare_refs = scan_repo_bare_refs(repo_root, weak_candidates)
    for table in merged:
      bare_ref = bare_refs.get(table["table_fqn"])
      if not bare_ref:
        continue
      table["bare_runtime_files"] = len(bare_ref["runtime_files"])
      table["bare_ref_categories"] = dict(sorted(bare_ref["categories"].items()))
      table["sample_bare_runtime_files"] = sorted(bare_ref["runtime_files"])[:8]

  for table in merged:
    table["usage_classification"] = classify_usage(table)

  return merged


def classify_usage(table: dict[str, Any]) -> str:
  if (
    table["qualified_runtime_files"] > 0
    or table["bare_runtime_files"] > 0
    or table["routine_refs"] > 0
    or table["view_refs"] > 0
  ):
    return "active_evidence"

  lowered_name = table["table_name"].lower()
  if "_bak" in lowered_name or "backup" in lowered_name or "snapshot" in lowered_name:
    return "archive_review_candidate"

  if table["estimated_rows"] == 0 and table["writes_since_stats_reset"] == 0:
    return "empty_review_candidate"

  return "runtime_review_required"


def summarize_by_schema(tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
  schemas: dict[str, dict[str, Any]] = {}
  for table in tables:
    schema = schemas.setdefault(
      table["schema_name"],
      {
        "schema_name": table["schema_name"],
        "table_count": 0,
        "total_bytes": 0,
        "estimated_rows": 0,
        "missing_table_comments": 0,
        "missing_column_comments": 0,
        "active_evidence": 0,
        "review_candidates": 0,
      },
    )
    schema["table_count"] += 1
    schema["total_bytes"] += table["total_bytes"]
    schema["estimated_rows"] += table["estimated_rows"]
    schema["missing_table_comments"] += table["missing_table_comment"]
    schema["missing_column_comments"] += table["missing_column_comments"]
    if table["usage_classification"] == "active_evidence":
      schema["active_evidence"] += 1
    else:
      schema["review_candidates"] += 1
  return [schemas[key] for key in sorted(schemas)]


def collect_audit(args: argparse.Namespace) -> dict[str, Any]:
  psql_bin = resolve_psql()
  pg_env = build_pg_env()
  repo_root = Path(args.repo_root).resolve()
  if not repo_root.exists():
    raise RuntimeError(f"repo root does not exist: {repo_root}")

  database = run_copy_query(psql_bin, pg_env, DATABASE_STATS_SQL, args.timeout)[0]
  inventory = run_copy_query(psql_bin, pg_env, TABLE_INVENTORY_SQL, args.timeout)
  db_refs = run_copy_query(psql_bin, pg_env, DB_REFERENCE_SQL, args.timeout)
  table_comment_summary = run_copy_query(
    psql_bin,
    pg_env,
    TABLE_COLUMN_COMMENT_SUMMARY_SQL,
    args.timeout,
  )
  ddl_comment_summary = run_copy_query(psql_bin, pg_env, DDL_COMMENT_SUMMARY_SQL, args.timeout)
  tables_for_scan = [
    {**row, "table_fqn": f"{row['schema_name']}.{row['table_name']}"}
    for row in inventory
  ]
  repo_refs = {}
  scan_root: Path | None = None
  if not args.skip_repo_scan:
    scan_root = repo_root
    repo_refs = scan_repo_qualified_refs(repo_root, tables_for_scan)

  table_evidence = merge_evidence(inventory, db_refs, repo_refs, scan_root)
  return {
    "database": database,
    "repo_root": str(repo_root),
    "repo_scan_enabled": not args.skip_repo_scan,
    "schema_summary": summarize_by_schema(table_evidence),
    "table_comment_summary": table_comment_summary,
    "ddl_comment_summary": ddl_comment_summary,
    "table_evidence": table_evidence,
    "cleanup_review_candidates": [
      table
      for table in table_evidence
      if table["usage_classification"] != "active_evidence"
    ],
  }


def format_bytes(value: int) -> str:
  units = ("B", "KiB", "MiB", "GiB")
  size = float(value)
  for unit in units:
    if size < 1024 or unit == units[-1]:
      return f"{size:.1f} {unit}"
    size /= 1024
  return f"{value} B"


def print_text_report(audit: dict[str, Any]) -> None:
  database = audit["database"]
  print(
    "database="
    + database["database_name"]
    + " user="
    + database["database_user"]
    + " postmaster_start="
    + (database.get("postmaster_start_time") or ""),
  )
  print("\nSchema summary:")
  for row in audit["schema_summary"]:
    print(
      f"- {row['schema_name']}: tables={row['table_count']} "
      f"size={format_bytes(row['total_bytes'])} rows~={row['estimated_rows']} "
      f"active={row['active_evidence']} review={row['review_candidates']} "
      f"missing_table_comments={row['missing_table_comments']} "
      f"missing_column_comments={row['missing_column_comments']}",
    )

  print("\nTable/column comment summary:")
  for row in audit["table_comment_summary"]:
    print(
      f"- {row['schema_name']}: objects={row['object_count']} "
      f"filled={row['filled_comments']} missing={row['missing_comments']} "
      f"non_chinese={row['non_chinese_comments']}",
    )

  print("\nDDL object comment summary:")
  for row in audit["ddl_comment_summary"]:
    print(
      f"- {row['object_type']}: objects={row['object_count']} "
      f"filled={row['filled_comments']} missing={row['missing_comments']} "
      f"non_chinese={row['non_chinese_comments']}",
    )

  print("\nCleanup review candidates:")
  candidates = audit["cleanup_review_candidates"]
  if not candidates:
    print("- none")
  for table in candidates:
    print(
      f"- {table['table_fqn']}: class={table['usage_classification']} "
      f"rows~={table['estimated_rows']} scans={table['seq_scan'] + table['idx_scan']} "
      f"writes={table['writes_since_stats_reset']} "
      f"qualified_repo_files={table['qualified_repo_files']} "
      f"bare_runtime_files={table['bare_runtime_files']}",
    )


def main() -> int:
  args = parse_args()
  try:
    audit = collect_audit(args)
  except Exception as error:
    print(f"ERROR: {error}", file=sys.stderr)
    return 1

  if args.output:
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")

  if args.format == "json":
    print(json.dumps(audit, ensure_ascii=False, indent=2))
  else:
    print_text_report(audit)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
