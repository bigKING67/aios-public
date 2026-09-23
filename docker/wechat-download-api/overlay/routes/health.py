#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Copyright (C) 2026 tmwgsicp
# Licensed under the GNU Affero General Public License v3.0
# See https://github.com/tmwgsicp/wechat-download-api for full source.
# SPDX-License-Identifier: AGPL-3.0-only
"""Health endpoint with credential-safe proxy and circuit summaries."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health", summary="健康检查")
async def health_check():
    from utils.article_list_client import provider_circuit_status
    from utils.http_client import ENGINE_NAME, proxy_required
    from utils.proxy_pool import proxy_pool

    return {
        "status": "healthy",
        "version": "1.0.0",
        "derived_version": "v1.7.0-aios.1",
        "framework": "FastAPI",
        "http_engine": ENGINE_NAME,
        "proxy_required": proxy_required(),
        "proxy_pool": proxy_pool.get_status(),
        "article_list_circuit": provider_circuit_status(),
    }
