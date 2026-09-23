#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Copyright (C) 2026 tmwgsicp
# Licensed under the GNU Affero General Public License v3.0
# See https://github.com/tmwgsicp/wechat-download-api for full source.
# SPDX-License-Identifier: AGPL-3.0-only
"""Shared appmsgpublish client with a persisted provider-wide circuit."""

import asyncio
import json
import math
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Mapping, Optional

from utils.http_client import fetch_json

APPMESSAGE_URL = "https://mp.weixin.qq.com/cgi-bin/appmsgpublish"
PROVIDER_NAME = "wechat_appmsgpublish"
RATE_LIMIT_RET = 200013
_REQUEST_LOCK = asyncio.Lock()


class ArticleListError(RuntimeError):
    """Base class for safe article-list failures exposed to callers."""


class ArticleListCircuitOpenError(ArticleListError):
    pass


class ArticleListRateLimitedError(ArticleListError):
    pass


class ArticleListTransportError(ArticleListError):
    pass


class ArticleListProtocolError(ArticleListError):
    pass


def _utc_iso(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).isoformat()


class ProviderCircuit:
    def __init__(
        self,
        path: Optional[Path] = None,
        *,
        cooldown_seconds: Optional[int] = None,
        probe_retry_seconds: Optional[int] = None,
        now: Callable[[], float] = time.time,
    ):
        default_path = os.getenv(
            "WECHAT_LIST_CIRCUIT_PATH",
            "/app/data/wechat-list-provider-circuit.json",
        )
        self.path = Path(path or default_path)
        self.cooldown_seconds = cooldown_seconds or int(
            os.getenv("WECHAT_LIST_RATE_LIMIT_COOLDOWN_SECONDS", "86400")
        )
        self.probe_retry_seconds = probe_retry_seconds or int(
            os.getenv("WECHAT_LIST_PROBE_RETRY_SECONDS", "300")
        )
        self._now = now

    def read(self) -> Dict[str, Any]:
        if not self.path.exists():
            return self._closed_state()
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ArticleListCircuitOpenError(
                f"{PROVIDER_NAME} circuit state is unreadable; request blocked"
            ) from exc
        valid = (
            isinstance(payload, dict)
            and payload.get("provider") == PROVIDER_NAME
            and payload.get("schema_version") == 1
            and payload.get("status") in {"open", "closed"}
        )
        if valid and payload["status"] == "open":
            retry_at = payload.get("retry_at_epoch")
            valid = (
                isinstance(retry_at, (int, float))
                and not isinstance(retry_at, bool)
                and math.isfinite(retry_at)
                and retry_at > 0
            )
        if not valid:
            raise ArticleListCircuitOpenError(
                f"{PROVIDER_NAME} circuit state is invalid; request blocked"
            )
        return payload

    def before_request(self) -> Dict[str, Any]:
        state = self.read()
        retry_at = float(state.get("retry_at_epoch", 0) or 0)
        if state.get("status") == "open" and retry_at > self._now():
            raise ArticleListCircuitOpenError(
                f"{PROVIDER_NAME} circuit open until {_utc_iso(retry_at)}"
            )
        return state

    def open_rate_limit(self, err_msg: Any) -> Dict[str, Any]:
        now = self._now()
        previous = self.read()
        opened_at = previous.get("opened_at") if previous.get("status") == "open" else None
        state = {
            "schema_version": 1,
            "provider": PROVIDER_NAME,
            "status": "open",
            "ret": RATE_LIMIT_RET,
            "reason": "provider frequency control",
            "opened_at": opened_at or _utc_iso(now),
            "last_seen_at": _utc_iso(now),
            "retry_at": _utc_iso(now + self.cooldown_seconds),
            "retry_at_epoch": now + self.cooldown_seconds,
        }
        self._write(state)
        return state

    def defer_failed_probe(self, previous: Mapping[str, Any]) -> None:
        if previous.get("status") != "open":
            return
        now = self._now()
        state = dict(previous)
        state["retry_at"] = _utc_iso(now + self.probe_retry_seconds)
        state["retry_at_epoch"] = now + self.probe_retry_seconds
        state["last_probe_failed_at"] = _utc_iso(now)
        self._write(state)

    def close(self) -> None:
        self._write(self._closed_state())

    def public_status(self) -> Dict[str, Any]:
        try:
            state = self.read()
        except ArticleListCircuitOpenError:
            return {"provider": PROVIDER_NAME, "status": "invalid", "request_allowed": False}
        retry_at = float(state.get("retry_at_epoch", 0) or 0)
        return {
            "provider": PROVIDER_NAME,
            "status": state.get("status", "closed"),
            "request_allowed": state.get("status") != "open" or retry_at <= self._now(),
            "ret": state.get("ret"),
            "retry_at": state.get("retry_at"),
        }

    def _closed_state(self) -> Dict[str, Any]:
        return {
            "schema_version": 1,
            "provider": PROVIDER_NAME,
            "status": "closed",
            "ret": None,
            "retry_at": None,
            "retry_at_epoch": 0,
        }

    def _write(self, state: Mapping[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_path = tempfile.mkstemp(
            dir=str(self.path.parent),
            prefix=f".{self.path.name}.",
            suffix=".tmp",
        )
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(dict(state), handle, ensure_ascii=True, sort_keys=True)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_path, self.path)
            os.chmod(self.path, 0o600)
        except Exception:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass
            raise


async def fetch_article_list_payload(
    *,
    params: Mapping[str, Any],
    headers: Mapping[str, str],
    timeout: int = 30,
    circuit: Optional[ProviderCircuit] = None,
    request_json: Optional[
        Callable[..., Awaitable[Dict[str, Any]]]
    ] = None,
) -> Dict[str, Any]:
    active_circuit = circuit or ProviderCircuit()
    active_request = request_json or fetch_json
    observed_state = active_circuit.read()

    async with _REQUEST_LOCK:
        previous = active_circuit.before_request()
        if (
            observed_state.get("status") == "open"
            and previous.get("status") != "open"
        ):
            # This call queued behind the single expired-circuit probe. It must
            # not turn one half-open probe into a second provider request.
            raise ArticleListCircuitOpenError(
                f"{PROVIDER_NAME} circuit probe already consumed; request blocked"
            )
        try:
            result = await active_request(
                APPMESSAGE_URL,
                params=params,
                headers=headers,
                timeout=timeout,
            )
        except ArticleListError:
            raise
        except Exception as exc:
            active_circuit.defer_failed_probe(previous)
            raise ArticleListTransportError(
                f"{PROVIDER_NAME} request failed via required proxy: {type(exc).__name__}"
            ) from exc

        if not isinstance(result, dict):
            active_circuit.defer_failed_probe(previous)
            raise ArticleListProtocolError(
                f"{PROVIDER_NAME} response root is not an object"
            )

        base_resp = result.get("base_resp", {})
        if not isinstance(base_resp, dict):
            active_circuit.defer_failed_probe(previous)
            raise ArticleListProtocolError(
                f"{PROVIDER_NAME} base_resp is not an object"
            )

        ret_code = base_resp.get("ret")
        if str(ret_code) == str(RATE_LIMIT_RET):
            state = active_circuit.open_rate_limit(base_resp.get("err_msg"))
            raise ArticleListRateLimitedError(
                f"{PROVIDER_NAME} rate limited: ret={RATE_LIMIT_RET}, "
                f"retry_at={state['retry_at']}"
            )

        active_circuit.close()
        return result


def provider_circuit_status() -> Dict[str, Any]:
    return ProviderCircuit().public_status()
