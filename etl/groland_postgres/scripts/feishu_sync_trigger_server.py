#!/usr/bin/env python3
"""AIOS 飞书同步触发桥接服务（宿主机 systemd 版）"""

from __future__ import annotations

import ipaddress
import json
import os
import shlex
import subprocess
import time
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Iterable
from urllib.parse import parse_qs


MAX_BODY_BYTES = 16 * 1024
DEFAULT_BIND = "0.0.0.0"
DEFAULT_PORT = 17888
DEFAULT_ALLOWED_CIDRS = "172.16.0.0/12,127.0.0.1/32"
DEFAULT_HTTP_TIMEOUT_SECONDS = 15
DEFAULT_SYSTEMD_TIMEOUT_SECONDS = 15

TOKEN_ENV_KEYS = ("DATAOPS_FEISHU_SYNC_TRIGGER_TOKEN", "FEISHU_SYNC_TRIGGER_TOKEN")
ALLOWED_SERVICE_FLAGS = {
    "",
    "--douyin-trade-sale",
    "--douyin-trade-sale-live",
    "--douyin-trade-sale-card",
    "--taobao-trade-sale",
    "--xhs-trade-sale",
    "--taobao-alimama-scenario",
    "--jd-trade-sale",
    "--wx-trade-sale",
}


def env_first(keys: Iterable[str]) -> str:
    for key in keys:
        value = (os.getenv(key) or "").strip()
        if value:
            return value
    return ""


def env_int(key: str, fallback: int) -> int:
    raw = (os.getenv(key) or "").strip()
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def parse_cidrs(raw: str) -> list[ipaddress._BaseNetwork]:
    cidrs: list[ipaddress._BaseNetwork] = []
    for item in raw.split(","):
        normalized = item.strip()
        if not normalized:
            continue
        cidrs.append(ipaddress.ip_network(normalized, strict=False))
    if not cidrs:
        raise ValueError("FEISHU_SYNC_TRIGGER_ALLOWED_CIDRS 不能为空")
    return cidrs


def validate_service_flag(raw_flag: str) -> str:
    normalized = raw_flag.strip()
    if normalized not in ALLOWED_SERVICE_FLAGS:
        raise ValueError(f"service_flag 不受支持：{normalized}")
    return normalized


@dataclass(frozen=True)
class TriggerConfig:
    token: str
    bind: str
    port: int
    allowed_cidrs: list[ipaddress._BaseNetwork]
    env_file: str
    repo_root: str
    project_root: str
    run_script: str
    uv_cache_dir: str
    log_file: str
    systemd_user: str
    systemd_group: str
    systemd_run_bin: str
    unit_prefix: str
    http_timeout_seconds: int
    systemd_timeout_seconds: int

    @staticmethod
    def load() -> "TriggerConfig":
        token = env_first(TOKEN_ENV_KEYS)
        if not token:
            raise ValueError(
                "缺少触发口令，请配置 DATAOPS_FEISHU_SYNC_TRIGGER_TOKEN 或 FEISHU_SYNC_TRIGGER_TOKEN"
            )

        bind = (os.getenv("FEISHU_SYNC_TRIGGER_BIND") or DEFAULT_BIND).strip() or DEFAULT_BIND
        port = env_int("FEISHU_SYNC_TRIGGER_PORT", DEFAULT_PORT)
        if port < 1 or port > 65535:
            raise ValueError("FEISHU_SYNC_TRIGGER_PORT 不合法")

        allowed_cidrs_raw = (
            os.getenv("FEISHU_SYNC_TRIGGER_ALLOWED_CIDRS") or DEFAULT_ALLOWED_CIDRS
        ).strip()
        allowed_cidrs = parse_cidrs(allowed_cidrs_raw)

        env_file = (os.getenv("FEISHU_SYNC_ENV_FILE") or "/opt/docker/compose/aios/.env.feishu-sync.vps").strip()
        repo_root = (os.getenv("FEISHU_SYNC_REPO_ROOT") or "/opt/docker/compose/aios").strip()
        project_root = (
            os.getenv("FEISHU_SYNC_PROJECT_ROOT")
            or "/opt/docker/compose/aios/etl/groland_postgres"
        ).strip()
        run_script = (
            os.getenv("FEISHU_SYNC_RUN_SCRIPT")
            or "/opt/docker/compose/aios/etl/groland_postgres/scripts/run_feishu_sync.sh"
        ).strip()
        uv_cache_dir = (os.getenv("FEISHU_SYNC_UV_CACHE_DIR") or "/tmp/uv-cache").strip()
        log_file = (os.getenv("FEISHU_SYNC_LOG_FILE") or "/var/log/aios_feishu_sync.log").strip()
        systemd_user = (os.getenv("FEISHU_SYNC_SYSTEMD_USER") or "root").strip() or "root"
        systemd_group = (os.getenv("FEISHU_SYNC_SYSTEMD_GROUP") or systemd_user).strip() or systemd_user
        systemd_run_bin = (os.getenv("FEISHU_SYNC_SYSTEMD_RUN_BIN") or "/usr/bin/systemd-run").strip()
        unit_prefix = (os.getenv("FEISHU_SYNC_SYSTEMD_UNIT_PREFIX") or "aios-feishu-sync-manual").strip()
        http_timeout_seconds = max(env_int("FEISHU_SYNC_TRIGGER_HTTP_TIMEOUT_SECONDS", DEFAULT_HTTP_TIMEOUT_SECONDS), 1)
        systemd_timeout_seconds = max(
            env_int("FEISHU_SYNC_TRIGGER_SYSTEMD_TIMEOUT_SECONDS", DEFAULT_SYSTEMD_TIMEOUT_SECONDS),
            1,
        )

        for required_path in (env_file, repo_root, project_root, run_script):
            if not os.path.exists(required_path):
                raise ValueError(f"路径不存在：{required_path}")

        if not os.path.isfile(run_script):
            raise ValueError(f"同步脚本不存在：{run_script}")

        if not os.path.isfile(env_file):
            raise ValueError(f"环境文件不存在：{env_file}")

        return TriggerConfig(
            token=token,
            bind=bind,
            port=port,
            allowed_cidrs=allowed_cidrs,
            env_file=env_file,
            repo_root=repo_root,
            project_root=project_root,
            run_script=run_script,
            uv_cache_dir=uv_cache_dir,
            log_file=log_file,
            systemd_user=systemd_user,
            systemd_group=systemd_group,
            systemd_run_bin=systemd_run_bin,
            unit_prefix=unit_prefix,
            http_timeout_seconds=http_timeout_seconds,
            systemd_timeout_seconds=systemd_timeout_seconds,
        )


class TriggerHandler(BaseHTTPRequestHandler):
    server_version = "AIOSFeishuSyncTrigger/1.0"
    config: TriggerConfig

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/healthz":
            self._send_json(HTTPStatus.OK, {"ok": True})
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/trigger":
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not found"})
            return

        if not self._is_client_allowed():
            self._send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "client ip not allowed"})
            return

        try:
            payload = self._read_payload()
        except ValueError as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
            return

        if not self._validate_token(payload):
            self._send_json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "unauthorized"})
            return

        raw_service_flag = str(payload.get("service_flag", "") or "")
        try:
            service_flag = validate_service_flag(raw_service_flag)
        except ValueError as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
            return

        try:
            unit_name = self._trigger_systemd_unit(service_flag)
        except Exception as error:  # noqa: BLE001
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(error)})
            return

        self._send_json(
            HTTPStatus.ACCEPTED,
            {
                "ok": True,
                "unit": unit_name,
                "service_flag": service_flag,
            },
        )

    def _read_payload(self) -> dict[str, str]:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length < 0:
            raise ValueError("Content-Length 非法")
        if content_length > MAX_BODY_BYTES:
            raise ValueError("请求体过大")

        raw_body = self.rfile.read(content_length) if content_length else b""
        if not raw_body:
            return {}

        content_type = (self.headers.get("Content-Type") or "").lower()
        body_text = raw_body.decode("utf-8", errors="replace")

        if "application/json" in content_type:
            payload = json.loads(body_text)
            if not isinstance(payload, dict):
                raise ValueError("JSON 请求体必须是对象")
            return {str(k): str(v) for k, v in payload.items()}

        form_payload = parse_qs(body_text, keep_blank_values=True)
        return {key: values[0] if values else "" for key, values in form_payload.items()}

    def _is_client_allowed(self) -> bool:
        client_ip = self.client_address[0]
        try:
            ip_obj = ipaddress.ip_address(client_ip)
        except ValueError:
            return False
        return any(ip_obj in cidr for cidr in self.config.allowed_cidrs)

    def _validate_token(self, payload: dict[str, str]) -> bool:
        auth_header = (self.headers.get("Authorization") or "").strip()
        token_header = (self.headers.get("X-DataOps-Trigger-Token") or "").strip()
        token_body = (payload.get("token") or "").strip()

        if auth_header.lower().startswith("bearer "):
            presented = auth_header[7:].strip()
            if presented and presented == self.config.token:
                return True

        if token_header and token_header == self.config.token:
            return True

        if token_body and token_body == self.config.token:
            return True

        return False

    def _trigger_systemd_unit(self, service_flag: str) -> str:
        unit_name = f"{self.config.unit_prefix}-{int(time.time() * 1000)}"
        quoted_run_script = shlex.quote(self.config.run_script)
        quoted_env_file = shlex.quote(self.config.env_file)
        quoted_project_root = shlex.quote(self.config.project_root)
        quoted_uv_cache_dir = shlex.quote(self.config.uv_cache_dir)
        cmd_parts = [quoted_run_script, "--env-file", quoted_env_file]
        if service_flag:
            cmd_parts.append(shlex.quote(service_flag))
        run_command = " ".join(cmd_parts)
        shell_command = (
            "set -a; "
            f"[ -f {quoted_env_file} ] && source {quoted_env_file}; "
            "set +a; "
            f"export PROJECT_ROOT={quoted_project_root}; "
            f"export UV_CACHE_DIR={quoted_uv_cache_dir}; "
            f"exec {run_command}"
        )

        command = [
            self.config.systemd_run_bin,
            "--unit",
            unit_name,
            "--property=Type=oneshot",
            f"--property=User={self.config.systemd_user}",
            f"--property=Group={self.config.systemd_group}",
            f"--property=WorkingDirectory={self.config.repo_root}",
            f"--property=StandardOutput=append:{self.config.log_file}",
            f"--property=StandardError=append:{self.config.log_file}",
            "/bin/bash",
            "-lc",
            shell_command,
        ]

        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=self.config.systemd_timeout_seconds,
        )
        if completed.returncode != 0:
            stdout = (completed.stdout or "").strip()
            stderr = (completed.stderr or "").strip()
            detail = stderr or stdout or f"exit_code={completed.returncode}"
            raise RuntimeError(f"systemd-run 失败：{detail}")

        return unit_name

    def _send_json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, fmt: str, *args: object) -> None:
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {self.address_string()} {fmt % args}")


def main() -> int:
    try:
        config = TriggerConfig.load()
    except Exception as error:  # noqa: BLE001
        print(f"[fatal] trigger config error: {error}")
        return 2

    TriggerHandler.config = config
    server = ThreadingHTTPServer((config.bind, config.port), TriggerHandler)
    server.timeout = config.http_timeout_seconds
    print(
        f"[startup] aios feishu trigger server listening on {config.bind}:{config.port}, "
        f"unit_prefix={config.unit_prefix}"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
