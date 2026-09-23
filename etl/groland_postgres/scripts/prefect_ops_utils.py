from __future__ import annotations

import json
import logging
import os
import random
import re
import shutil
import subprocess
import time
from datetime import date, datetime
from typing import List, Optional, Sequence, Tuple

from urllib.error import URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

# 默认飞书 Webhook URL（建议通过环境变量显式配置）
DEFAULT_FEISHU_WEBHOOK_URL = ""
FEISHU_WEBHOOK_ENV_KEYS = (
  "FEISHU_WEBHOOK_URL",
  "DATAOPS_FEISHU_DEFAULT_WEBHOOK_URL",
)

# psql 执行超时（秒）
DEFAULT_PSQL_TIMEOUT = 600
DEFAULT_PSQL_CONNECT_TIMEOUT = 20
DEFAULT_PSQL_RETRY_ATTEMPTS = 4
DEFAULT_PSQL_RETRY_BACKOFF_SECONDS = 3
DEFAULT_PSQL_RETRY_BACKOFF_MAX_SECONDS = 45
DEFAULT_PSQL_RETRY_JITTER_MILLISECONDS = 900
DEFAULT_PSQL_STATEMENT_TIMEOUT_MS = 300000
DEFAULT_PSQL_LOCK_TIMEOUT_MS = 30000

DEFAULT_FEISHU_RETRY_ATTEMPTS = 3
DEFAULT_FEISHU_RETRY_BACKOFF_SECONDS = 2
DEFAULT_FEISHU_RETRY_BACKOFF_MAX_SECONDS = 20
MILLISECONDS_PER_SECOND = 1000

TRANSIENT_PSQL_ERROR_KEYWORDS = (
  "server closed the connection unexpectedly",
  "terminating connection due to administrator command",
  "could not connect to server",
  "connection refused",
  "connection timed out",
  "timeout expired",
  "connection reset by peer",
  "broken pipe",
  "ssl syscall error",
  "eof detected",
  "no route to host",
  "network is unreachable",
  "the database system is starting up",
  "remaining connection slots are reserved",
  "too many clients already",
  "could not receive data from server",
  "could not send data to server",
)

NON_RETRYABLE_PSQL_ERROR_KEYWORDS = (
  "password authentication failed",
  "role \"",
  "database \"",
  "syntax error",
  "permission denied",
  "does not exist",
)

logger = logging.getLogger(__name__)


def _read_positive_int_env(name: str, default: int) -> int:
  raw_value = (os.getenv(name) or "").strip()
  if not raw_value:
    return default

  try:
    parsed = int(raw_value)
  except ValueError:
    logger.warning("Invalid integer env %s=%r, fallback to %s", name, raw_value, default)
    return default

  if parsed <= 0:
    logger.warning("Non-positive env %s=%r, fallback to %s", name, raw_value, default)
    return default

  return parsed


def _read_non_negative_int_env(name: str, default: int) -> int:
  raw_value = (os.getenv(name) or "").strip()
  if not raw_value:
    return default

  try:
    parsed = int(raw_value)
  except ValueError:
    logger.warning("Invalid integer env %s=%r, fallback to %s", name, raw_value, default)
    return default

  if parsed < 0:
    logger.warning("Negative env %s=%r, fallback to %s", name, raw_value, default)
    return default

  return parsed


def _read_non_empty_str_env(name: str, default: str = "") -> str:
  value = (os.getenv(name) or "").strip()
  if value:
    return value
  return default


def _parse_database_url() -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]:
  raw_database_url = _read_non_empty_str_env("DATABASE_URL")
  if not raw_database_url:
    return None, None, None, None, None

  try:
    parsed = urlparse(raw_database_url)
  except Exception as error:
    logger.warning("Invalid DATABASE_URL, fallback to PG* env: %s", error)
    return None, None, None, None, None

  if parsed.scheme and parsed.scheme not in ("postgres", "postgresql"):
    logger.warning("Unsupported DATABASE_URL scheme=%s, fallback to PG* env", parsed.scheme)
    return None, None, None, None, None

  database_path = parsed.path.lstrip("/")
  database = database_path.split("/")[0] if database_path else None

  return (
    parsed.hostname or None,
    str(parsed.port) if parsed.port else None,
    unquote(parsed.username) if parsed.username else None,
    unquote(parsed.password) if parsed.password else None,
    database or None,
  )


def _resolve_pg_connection_config() -> Tuple[str, str, str, str, str]:
  (
    db_url_host,
    db_url_port,
    db_url_user,
    db_url_password,
    db_url_database,
  ) = _parse_database_url()

  pg_host = _read_non_empty_str_env("PGHOST", db_url_host or "127.0.0.1")
  pg_port = _read_non_empty_str_env("PGPORT", db_url_port or "5432")
  pg_user = _read_non_empty_str_env("PGUSER", db_url_user or "postgres")
  pg_database = _read_non_empty_str_env("PGDATABASE", db_url_database or "postgres")
  pg_password = _read_non_empty_str_env("PGPASSWORD", db_url_password or "")

  if not pg_password:
    raise RuntimeError(
      "Missing required env PGPASSWORD. "
      "Set PGPASSWORD or provide password in DATABASE_URL before running ETL flows."
    )

  return pg_host, pg_port, pg_user, pg_password, pg_database


def _resolve_pg_timeout_options() -> str:
  statement_timeout_ms = _read_positive_int_env(
    "PGSTATEMENT_TIMEOUT_MS",
    DEFAULT_PSQL_STATEMENT_TIMEOUT_MS,
  )
  lock_timeout_ms = _read_positive_int_env(
    "PGLOCK_TIMEOUT_MS",
    DEFAULT_PSQL_LOCK_TIMEOUT_MS,
  )

  options = [
    f"-c statement_timeout={statement_timeout_ms}",
    f"-c lock_timeout={lock_timeout_ms}",
  ]
  return " ".join(options)


def _is_transient_psql_error(error_message: str) -> bool:
  normalized_error = error_message.lower()
  if any(keyword in normalized_error for keyword in NON_RETRYABLE_PSQL_ERROR_KEYWORDS):
    return False
  return any(keyword in normalized_error for keyword in TRANSIENT_PSQL_ERROR_KEYWORDS)


def _resolve_backoff_seconds(
  attempt: int,
  base_delay_seconds: int,
  max_delay_seconds: int,
) -> float:
  if max_delay_seconds < base_delay_seconds:
    max_delay_seconds = base_delay_seconds

  backoff_seconds = min(base_delay_seconds * (2 ** (attempt - 1)), max_delay_seconds)
  jitter_milliseconds = _read_non_negative_int_env(
    "PSQL_RETRY_JITTER_MILLISECONDS",
    DEFAULT_PSQL_RETRY_JITTER_MILLISECONDS,
  )
  if jitter_milliseconds <= 0:
    return float(backoff_seconds)

  jitter_seconds = random.uniform(0, jitter_milliseconds / MILLISECONDS_PER_SECOND)
  return float(backoff_seconds) + jitter_seconds


def _resolve_psql_executable() -> str:
  configured = (os.getenv("PSQL_BIN") or "").strip()
  if configured and os.path.exists(configured):
    return configured

  from_path = shutil.which("psql")
  if from_path:
    return from_path

  common_candidates = [
    r"C:\Users\Groland\scoop\apps\postgresql\current\bin\psql.exe",
    r"C:\Program Files\PostgreSQL\17\bin\psql.exe",
    r"C:\Program Files\PostgreSQL\16\bin\psql.exe",
    r"C:\Program Files\PostgreSQL\15\bin\psql.exe",
  ]
  for candidate in common_candidates:
    if os.path.exists(candidate):
      return candidate

  raise RuntimeError(
    "psql executable not found. Set environment variable PSQL_BIN, "
    "or ensure psql is available in PATH."
  )


def run_psql_file(
  file_path: str,
  timeout: Optional[int] = None,
) -> str:
  """执行 psql 文件并返回输出，与 run_psql 共享相同的重试/超时/日志策略。

  Args:
    file_path: SQL 文件路径（绝对路径或相对于调用目录的路径）
    timeout: 超时时间（秒），默认 600 秒

  Returns:
    psql 输出（包含 NOTICE 信息）

  Raises:
    RuntimeError: psql 执行失败或超时
  """
  pg_host, pg_port, pg_user, pg_password, pg_database = _resolve_pg_connection_config()
  psql_bin = _resolve_psql_executable()
  effective_timeout = timeout or _read_positive_int_env("PSQL_TIMEOUT", DEFAULT_PSQL_TIMEOUT)
  connect_timeout = _read_positive_int_env("PGCONNECT_TIMEOUT", DEFAULT_PSQL_CONNECT_TIMEOUT)
  retry_attempts = _read_positive_int_env("PSQL_RETRY_ATTEMPTS", DEFAULT_PSQL_RETRY_ATTEMPTS)
  retry_backoff_seconds = _read_positive_int_env(
    "PSQL_RETRY_BACKOFF_SECONDS",
    DEFAULT_PSQL_RETRY_BACKOFF_SECONDS,
  )
  retry_backoff_max_seconds = _read_positive_int_env(
    "PSQL_RETRY_BACKOFF_MAX_SECONDS",
    DEFAULT_PSQL_RETRY_BACKOFF_MAX_SECONDS,
  )

  command = [
    psql_bin,
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    pg_host,
    "-p",
    pg_port,
    "-U",
    pg_user,
    "-d",
    pg_database,
    "-f",
    file_path,
  ]

  env = os.environ.copy()
  env["PGPASSWORD"] = pg_password
  env["PGCLIENTENCODING"] = "UTF8"
  env["LC_MESSAGES"] = "C"
  env.setdefault("PGCONNECT_TIMEOUT", str(connect_timeout))
  timeout_options = _resolve_pg_timeout_options()
  existing_pg_options = (env.get("PGOPTIONS") or "").strip()
  if existing_pg_options:
    env["PGOPTIONS"] = f"{existing_pg_options} {timeout_options}"
  else:
    env["PGOPTIONS"] = timeout_options

  for attempt in range(1, retry_attempts + 1):
    try:
      process = subprocess.run(
        command,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=effective_timeout,
      )
    except subprocess.TimeoutExpired as error:
      raise RuntimeError(f"psql execution timed out after {effective_timeout}s") from error

    stdout = process.stdout.strip() if process.stdout else ""
    stderr = process.stderr.strip() if process.stderr else ""

    if process.returncode != 0:
      error_message = stderr or stdout or "psql execution failed"
      should_retry = (
        attempt < retry_attempts
        and _is_transient_psql_error(error_message)
      )
      if should_retry:
        backoff_seconds = _resolve_backoff_seconds(
          attempt=attempt,
          base_delay_seconds=retry_backoff_seconds,
          max_delay_seconds=retry_backoff_max_seconds,
        )
        logger.warning(
          (
            "Transient psql error on attempt %s/%s, retry in %ss "
            "(host=%s, db=%s, file=%s): %s"
          ),
          attempt,
          retry_attempts,
          f"{backoff_seconds:.2f}",
          pg_host,
          pg_database,
          file_path,
          error_message.replace("\n", " ")[:240],
        )
        time.sleep(backoff_seconds)
        continue
      raise RuntimeError(error_message)

    result_chunks = []
    if stdout:
      result_chunks.append(stdout)

    if stderr:
      notice_lines = []
      for raw_line in stderr.splitlines():
        line = raw_line.strip()
        if line.startswith("NOTICE:") or line.startswith("WARNING:"):
          notice_lines.append(line)
      if notice_lines:
        result_chunks.append("\n".join(notice_lines))

    return "\n".join(result_chunks).strip()

  raise RuntimeError("psql execution failed")


def run_psql(
  sql_statement: str,
  tuples_only: bool = False,
  timeout: Optional[int] = None,
) -> str:
  """执行 psql 命令并返回输出。

  Args:
    sql_statement: 要执行的 SQL 语句
    tuples_only: 是否只返回数据行（无表头）
    timeout: 超时时间（秒），默认 600 秒

  Returns:
    psql 输出（包含 NOTICE 信息）

  Raises:
    RuntimeError: psql 执行失败或超时
  """
  pg_host, pg_port, pg_user, pg_password, pg_database = _resolve_pg_connection_config()
  psql_bin = _resolve_psql_executable()
  effective_timeout = timeout or _read_positive_int_env("PSQL_TIMEOUT", DEFAULT_PSQL_TIMEOUT)
  connect_timeout = _read_positive_int_env("PGCONNECT_TIMEOUT", DEFAULT_PSQL_CONNECT_TIMEOUT)
  retry_attempts = _read_positive_int_env("PSQL_RETRY_ATTEMPTS", DEFAULT_PSQL_RETRY_ATTEMPTS)
  retry_backoff_seconds = _read_positive_int_env(
    "PSQL_RETRY_BACKOFF_SECONDS",
    DEFAULT_PSQL_RETRY_BACKOFF_SECONDS,
  )
  retry_backoff_max_seconds = _read_positive_int_env(
    "PSQL_RETRY_BACKOFF_MAX_SECONDS",
    DEFAULT_PSQL_RETRY_BACKOFF_MAX_SECONDS,
  )

  command = [
    psql_bin,
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    pg_host,
    "-p",
    pg_port,
    "-U",
    pg_user,
    "-d",
    pg_database,
  ]

  if tuples_only:
    command.extend(["-P", "pager=off", "-A", "-t"])

  command.extend(["-c", sql_statement])

  env = os.environ.copy()
  env["PGPASSWORD"] = pg_password
  env["PGCLIENTENCODING"] = "UTF8"
  env["LC_MESSAGES"] = "C"  # 强制 psql 输出英文错误信息，避免 Windows GBK 乱码
  env.setdefault("PGCONNECT_TIMEOUT", str(connect_timeout))
  timeout_options = _resolve_pg_timeout_options()
  existing_pg_options = (env.get("PGOPTIONS") or "").strip()
  if existing_pg_options:
    env["PGOPTIONS"] = f"{existing_pg_options} {timeout_options}"
  else:
    env["PGOPTIONS"] = timeout_options

  for attempt in range(1, retry_attempts + 1):
    try:
      process = subprocess.run(
        command,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=effective_timeout,
      )
    except subprocess.TimeoutExpired as error:
      raise RuntimeError(f"psql execution timed out after {effective_timeout}s") from error

    stdout = process.stdout.strip() if process.stdout else ""
    stderr = process.stderr.strip() if process.stderr else ""

    if process.returncode != 0:
      error_message = stderr or stdout or "psql execution failed"
      should_retry = (
        attempt < retry_attempts
        and _is_transient_psql_error(error_message)
      )
      if should_retry:
        backoff_seconds = _resolve_backoff_seconds(
          attempt=attempt,
          base_delay_seconds=retry_backoff_seconds,
          max_delay_seconds=retry_backoff_max_seconds,
        )
        logger.warning(
          (
            "Transient psql error on attempt %s/%s, retry in %ss "
            "(host=%s, db=%s): %s"
          ),
          attempt,
          retry_attempts,
          f"{backoff_seconds:.2f}",
          pg_host,
          pg_database,
          error_message.replace("\n", " ")[:240],
        )
        time.sleep(backoff_seconds)
        continue
      raise RuntimeError(error_message)

    result_chunks = []
    if stdout:
      result_chunks.append(stdout)

    if stderr:
      notice_lines = []
      for raw_line in stderr.splitlines():
        line = raw_line.strip()
        if line.startswith("NOTICE:") or line.startswith("WARNING:"):
          notice_lines.append(line)
      if notice_lines:
        result_chunks.append("\n".join(notice_lines))

    return "\n".join(result_chunks).strip()

  raise RuntimeError("psql execution failed")


def send_feishu_notification(
  title: str,
  table_name: str,
  action: str,
  status: str,
  reason: str = "",
  detail_lines: Optional[Sequence[str]] = None,
  webhook_url: Optional[str] = None,
  raise_on_error: bool = False,
) -> bool:
  """发送飞书通知。"""
  resolved_webhook = (
    webhook_url
    or next(
      (
        os.getenv(env_key, "").strip()
        for env_key in FEISHU_WEBHOOK_ENV_KEYS
        if os.getenv(env_key, "").strip()
      ),
      "",
    )
    or DEFAULT_FEISHU_WEBHOOK_URL
  ).strip()

  if not resolved_webhook:
    logger.warning("No Feishu webhook URL configured, notification skipped")
    return False

  retry_attempts = _read_positive_int_env(
    "FEISHU_RETRY_ATTEMPTS",
    DEFAULT_FEISHU_RETRY_ATTEMPTS,
  )
  retry_backoff_seconds = _read_positive_int_env(
    "FEISHU_RETRY_BACKOFF_SECONDS",
    DEFAULT_FEISHU_RETRY_BACKOFF_SECONDS,
  )
  retry_backoff_max_seconds = _read_positive_int_env(
    "FEISHU_RETRY_BACKOFF_MAX_SECONDS",
    DEFAULT_FEISHU_RETRY_BACKOFF_MAX_SECONDS,
  )

  normalized_status = status.strip().casefold()
  is_failure = normalized_status in {"失败", "failed", "failure", "error"}
  is_success = normalized_status in {"成功", "success", "succeeded", "recovered"}

  if is_success:
    status_display = "✅ 成功"
    header_template = "green"
  elif is_failure:
    status_display = "❌ 失败"
    header_template = "red"
  else:
    status_display = f"ℹ️ {status}"
    header_template = "blue"

  event_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
  sanitized_details = [
    detail.strip()
    for detail in (detail_lines or [])
    if detail and detail.strip()
  ]
  if not sanitized_details:
    sanitized_details = ["无数据变更"]

  failure_reason = ((reason or "未知错误").strip())[:500]
  if is_failure:
    detail_block = "**失败原因**\n\n" + f"- {failure_reason}"
  else:
    detail_block = "**明细**\n\n" + "\n".join(f"- {line[:220]}" for line in sanitized_details[:12])

  overview_block = (
    f"**时间**：{event_time}\n\n"
    f"**数据表**：`{table_name}`\n\n"
    f"**动作**：{action}\n\n"
    f"**状态**：{status_display}"
  )

  card_payload = {
    "msg_type": "interactive",
    "card": {
      "config": {
        "wide_screen_mode": True,
      },
      "header": {
        "template": header_template,
        "title": {
          "tag": "plain_text",
          "content": title,
        },
      },
      "elements": [
        {
          "tag": "div",
          "text": {
            "tag": "lark_md",
            "content": overview_block,
          },
        },
        {"tag": "hr"},
        {
          "tag": "div",
          "text": {
            "tag": "lark_md",
            "content": detail_block,
          },
        },
      ],
    },
  }

  post_payload = {
    "msg_type": "post",
    "content": {
      "post": {
        "zh_cn": {
          "title": title,
          "content": [
            [{"tag": "text", "text": f"时间：{event_time}"}],
            [{"tag": "text", "text": f"数据表：{table_name}"}],
            [{"tag": "text", "text": f"动作：{action}"}],
            [{"tag": "text", "text": f"状态：{status_display}"}],
          ]
          + (
            [[{"tag": "text", "text": f"失败原因：{failure_reason}"}]]
            if is_failure
            else [[{"tag": "text", "text": f"- {line[:220]}"}] for line in sanitized_details[:12]]
          ),
        }
      }
    },
  }

  def _try_send(payload: dict) -> Tuple[bool, str]:
    request = Request(
      resolved_webhook,
      data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
      headers={"Content-Type": "application/json; charset=utf-8"},
      method="POST",
    )
    try:
      with urlopen(request, timeout=10) as response:
        body = response.read().decode("utf-8")
      parsed = json.loads(body) if body else {}
      status_code = parsed.get("StatusCode")
      code = parsed.get("code")
      if status_code == 0 or code == 0:
        return True, ""
      return False, body
    except URLError as error:
      return False, str(error)

  last_error_detail = ""
  for attempt in range(1, retry_attempts + 1):
    success, error_msg = _try_send(card_payload)
    if success:
      return True

    success, fallback_error = _try_send(post_payload)
    if success:
      return True

    last_error_detail = f"card error: {error_msg}; post error: {fallback_error}"
    if attempt >= retry_attempts:
      break

    backoff_seconds = _resolve_backoff_seconds(
      attempt=attempt,
      base_delay_seconds=retry_backoff_seconds,
      max_delay_seconds=retry_backoff_max_seconds,
    )
    logger.warning(
      "Feishu send failed on attempt %s/%s, retry in %ss: %s",
      attempt,
      retry_attempts,
      f"{backoff_seconds:.2f}",
      last_error_detail,
    )
    time.sleep(backoff_seconds)

  if raise_on_error:
    raise RuntimeError(f"Failed to send Feishu notification: {last_error_detail}")
  logger.error(f"Failed to send Feishu notification: {last_error_detail}")
  return False


# ============ 通用解析函数（从各 ETL 脚本抽取） ============

def extract_notice_lines(raw_output: str) -> List[str]:
  """从 psql 输出中提取 NOTICE 行。"""
  lines = []
  for line in raw_output.splitlines():
    normalized = line.strip()
    if not normalized:
      continue
    if normalized.startswith("NOTICE:"):
      lines.append(normalized.replace("NOTICE:", "").strip())
  return lines


# 通用日期窗口解析正则
WINDOW_RANGE_PATTERN = re.compile(
  r"window\s+\[\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})\s*\]",
  re.IGNORECASE,
)


def resolve_refresh_window(notice_lines: List[str]) -> Tuple[Optional[date], Optional[date]]:
  """从 NOTICE 行中解析刷新窗口的最小和最大日期。"""
  min_date: Optional[date] = None
  max_date: Optional[date] = None

  for raw_line in notice_lines:
    matched = WINDOW_RANGE_PATTERN.search(raw_line)
    if not matched:
      continue

    try:
      start_date = date.fromisoformat(matched.group(1))
      end_date = date.fromisoformat(matched.group(2))
    except ValueError:
      continue

    if min_date is None or start_date < min_date:
      min_date = start_date

    if max_date is None or end_date > max_date:
      max_date = end_date

  return min_date, max_date

