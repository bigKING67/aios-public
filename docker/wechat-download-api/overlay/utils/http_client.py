#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Copyright (C) 2026 tmwgsicp
# Licensed under the GNU Affero General Public License v3.0
# See https://github.com/tmwgsicp/wechat-download-api for full source.
# SPDX-License-Identifier: AGPL-3.0-only
"""Shared curl_cffi/proxy transport for HTML and WeChat JSON requests."""

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Mapping, Optional

from utils.proxy_pool import proxy_pool, redact_proxy_url

logger = logging.getLogger(__name__)

try:
    from curl_cffi.requests import Session as CurlSession

    HAS_CURL_CFFI = True
except ImportError:
    CurlSession = None
    HAS_CURL_CFFI = False

ENGINE_NAME = "curl_cffi (Chrome TLS)" if HAS_CURL_CFFI else "httpx (fallback)"
logger.info("HTTP engine: %s", ENGINE_NAME)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

MAX_PROXY_RETRIES = 3
_executor = ThreadPoolExecutor(max_workers=4)


class ProxyUnavailableError(RuntimeError):
    """The proxy-required transport cannot make a safe request."""


def proxy_required() -> bool:
    value = os.getenv("WECHAT_PROXY_REQUIRED", "true").strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise ProxyUnavailableError("invalid WECHAT_PROXY_REQUIRED boolean; request blocked")


async def fetch_page(
    url: str,
    extra_headers: Optional[Dict] = None,
    timeout: int = 30,
) -> str:
    headers = {**BROWSER_HEADERS}
    if extra_headers:
        headers.update(extra_headers)
    return await _request_with_proxy_policy(
        url,
        lambda proxy: _do_fetch(url, headers, timeout, proxy),
    )


async def fetch_json(
    url: str,
    *,
    params: Mapping[str, Any],
    headers: Mapping[str, str],
    timeout: int = 30,
) -> Dict[str, Any]:
    request_headers = {**BROWSER_HEADERS, **dict(headers)}
    result = await _request_with_proxy_policy(
        url,
        lambda proxy: _do_fetch_json(url, params, request_headers, timeout, proxy),
    )
    if not isinstance(result, dict):
        raise ValueError("JSON response root must be an object")
    return result


async def _request_with_proxy_policy(url: str, request):
    required = proxy_required()
    if required and not HAS_CURL_CFFI:
        raise ProxyUnavailableError("curl_cffi is required for proxied requests")

    tried_proxies = []
    for _ in range(min(MAX_PROXY_RETRIES, proxy_pool.count)):
        proxy = proxy_pool.next()
        if proxy is None or proxy in tried_proxies:
            break
        tried_proxies.append(proxy)
        logger.info(
            "outbound request: url=%s proxy=%s",
            url[:80],
            redact_proxy_url(proxy),
        )
        try:
            result = await request(proxy)
            proxy_pool.mark_ok(proxy)
            return result
        except Exception as exc:
            logger.warning(
                "Proxy %s transport failed: %s",
                redact_proxy_url(proxy),
                type(exc).__name__,
            )
            proxy_pool.mark_failed(proxy)

    if required:
        if not proxy_pool.enabled:
            reason = "no proxy is configured"
        elif not tried_proxies:
            reason = "all configured proxies are cooling down"
        else:
            reason = "all attempted proxies failed"
        raise ProxyUnavailableError(f"proxy-required request blocked: {reason}")

    logger.info("outbound request: url=%s proxy=direct (explicit fallback)", url[:80])
    return await request(None)


async def _do_fetch(
    url: str,
    headers: Mapping[str, str],
    timeout: int,
    proxy: Optional[str],
) -> str:
    if HAS_CURL_CFFI:
        return await _fetch_curl_cffi(url, headers, timeout, proxy)
    return await _fetch_httpx(url, headers, timeout, proxy)


async def _do_fetch_json(
    url: str,
    params: Mapping[str, Any],
    headers: Mapping[str, str],
    timeout: int,
    proxy: Optional[str],
) -> Dict[str, Any]:
    if HAS_CURL_CFFI:
        return await _fetch_curl_cffi_json(url, params, headers, timeout, proxy)
    return await _fetch_httpx_json(url, params, headers, timeout, proxy)


async def _fetch_curl_cffi(
    url: str,
    headers: Mapping[str, str],
    timeout: int,
    proxy: Optional[str],
) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _executor,
        _fetch_curl_cffi_sync,
        url,
        headers,
        timeout,
        proxy,
    )


def _fetch_curl_cffi_sync(
    url: str,
    headers: Mapping[str, str],
    timeout: int,
    proxy: Optional[str],
) -> str:
    kwargs = {"timeout": timeout, "allow_redirects": True, "verify": True}
    if proxy:
        kwargs["proxy"] = proxy
    with CurlSession(impersonate="chrome120") as session:
        response = session.get(url, headers=dict(headers), **kwargs)
        response.raise_for_status()
        return response.text


async def _fetch_curl_cffi_json(
    url: str,
    params: Mapping[str, Any],
    headers: Mapping[str, str],
    timeout: int,
    proxy: Optional[str],
) -> Dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _executor,
        _fetch_curl_cffi_json_sync,
        url,
        params,
        headers,
        timeout,
        proxy,
    )


def _fetch_curl_cffi_json_sync(
    url: str,
    params: Mapping[str, Any],
    headers: Mapping[str, str],
    timeout: int,
    proxy: Optional[str],
) -> Dict[str, Any]:
    kwargs = {"timeout": timeout, "allow_redirects": False, "verify": True}
    if proxy:
        kwargs["proxy"] = proxy
    with CurlSession(impersonate="chrome120") as session:
        response = session.get(
            url,
            params=dict(params),
            headers=dict(headers),
            **kwargs,
        )
        response.raise_for_status()
        return response.json()


async def _fetch_httpx(
    url: str,
    headers: Mapping[str, str],
    timeout: int,
    proxy: Optional[str],
) -> str:
    import httpx

    transport_kwargs = {"proxy": proxy} if proxy else {}
    async with httpx.AsyncClient(
        timeout=float(timeout),
        follow_redirects=True,
        **transport_kwargs,
    ) as client:
        response = await client.get(url, headers=dict(headers))
        response.raise_for_status()
        return response.text


async def _fetch_httpx_json(
    url: str,
    params: Mapping[str, Any],
    headers: Mapping[str, str],
    timeout: int,
    proxy: Optional[str],
) -> Dict[str, Any]:
    import httpx

    transport_kwargs = {"proxy": proxy} if proxy else {}
    async with httpx.AsyncClient(
        timeout=float(timeout),
        follow_redirects=False,
        **transport_kwargs,
    ) as client:
        response = await client.get(url, params=dict(params), headers=dict(headers))
        response.raise_for_status()
        return response.json()
