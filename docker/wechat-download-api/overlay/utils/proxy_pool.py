#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Copyright (C) 2026 tmwgsicp
# Licensed under the GNU Affero General Public License v3.0
# See https://github.com/tmwgsicp/wechat-download-api for full source.
# SPDX-License-Identifier: AGPL-3.0-only
"""Credential-safe proxy pool for the AIOS v1.7.0 derived image."""

import logging
import os
import threading
import time
from typing import List, Optional
from urllib.parse import urlsplit, urlunsplit

logger = logging.getLogger(__name__)

FAIL_COOLDOWN = 120


def redact_proxy_url(proxy: str) -> str:
    """Return a log-safe proxy identifier without credentials or URL data."""
    try:
        parsed = urlsplit(proxy)
        if not parsed.scheme or not parsed.hostname:
            return "<redacted-proxy>"
        host = parsed.hostname
        if ":" in host and not host.startswith("["):
            host = f"[{host}]"
        port = f":{parsed.port}" if parsed.port is not None else ""
        auth = "***:***@" if parsed.username is not None else ""
        return urlunsplit((parsed.scheme, f"{auth}{host}{port}", "", "", ""))
    except (TypeError, ValueError):
        return "<redacted-proxy>"


class ProxyPool:
    """Round-robin proxy pool with bounded transport-failure cooldown."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._proxies: List[str] = []
        self._index = 0
        self._fail_until: dict[str, float] = {}
        self._lock = threading.Lock()
        self._load_proxies()
        self._initialized = True

    def _load_proxies(self):
        raw = os.getenv("PROXY_URLS", "").strip()
        if not raw:
            logger.info("Proxy pool: no proxies configured")
            return

        self._proxies = [item.strip() for item in raw.split(",") if item.strip()]
        logger.info("Proxy pool: loaded %d proxies", len(self._proxies))

    def reload(self):
        with self._lock:
            self._proxies = []
            self._index = 0
            self._fail_until.clear()
            self._load_proxies()

    @property
    def enabled(self) -> bool:
        return bool(self._proxies)

    @property
    def count(self) -> int:
        return len(self._proxies)

    def next(self) -> Optional[str]:
        if not self._proxies:
            return None
        now = time.time()
        with self._lock:
            for _ in range(len(self._proxies)):
                proxy = self._proxies[self._index % len(self._proxies)]
                self._index += 1
                if self._fail_until.get(proxy, 0) <= now:
                    return proxy
        return None

    def get_all(self) -> List[str]:
        return list(self._proxies)

    def mark_failed(self, proxy: str):
        with self._lock:
            self._fail_until[proxy] = time.time() + FAIL_COOLDOWN
        logger.warning(
            "Proxy %s marked failed, cooldown %ds",
            redact_proxy_url(proxy),
            FAIL_COOLDOWN,
        )

    def mark_ok(self, proxy: str):
        with self._lock:
            self._fail_until.pop(proxy, None)

    def get_status(self) -> dict:
        now = time.time()
        healthy = []
        failed = []
        for proxy in self._proxies:
            target = failed if self._fail_until.get(proxy, 0) > now else healthy
            target.append(redact_proxy_url(proxy))
        return {
            "enabled": self.enabled,
            "total": self.count,
            "healthy": len(healthy),
            "failed": len(failed),
            "failed_proxies": failed,
        }


proxy_pool = ProxyPool()
