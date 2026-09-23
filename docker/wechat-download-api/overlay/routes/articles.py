#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Copyright (C) 2026 tmwgsicp
# Licensed under the GNU Affero General Public License v3.0
# See https://github.com/tmwgsicp/wechat-download-api for full source.
# SPDX-License-Identifier: AGPL-3.0-only
"""Article-list API using the shared proxy-required provider client."""

import json
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from utils.article_list_client import ArticleListError, fetch_article_list_payload
from utils.auth_manager import auth_manager
from utils.wechat_status import (
    LOGIN_EXPIRED_MSG,
    is_invalid_fakeid,
    is_login_expired,
)

router = APIRouter()


class ArticleItem(BaseModel):
    aid: str
    title: str
    link: str
    update_time: int
    create_time: int
    digest: Optional[str] = None
    cover: Optional[str] = None
    author: Optional[str] = None


class ArticlesResponse(BaseModel):
    success: bool
    data: Optional[Dict] = None
    error: Optional[str] = None


@router.get("/articles", response_model=ArticlesResponse, summary="获取文章列表")
async def get_articles(
    fakeid: str = Query(..., description="目标公众号的 FakeID（通过搜索接口获取）"),
    begin: int = Query(0, description="偏移量，从第几条开始", ge=0, alias="begin"),
    count: int = Query(10, description="获取数量，最大 100", ge=1, le=100),
    keyword: Optional[str] = Query(None, description="在该公众号内搜索关键词（可选）"),
):
    try:
        print(f"[INFO] get article list: fakeid={fakeid[:8]}...")
        creds = auth_manager.get_credentials()
        if not creds or not isinstance(creds, dict):
            raise HTTPException(status_code=401, detail="未登录或认证信息格式错误")

        token = creds.get("token", "")
        cookie = creds.get("cookie", "")
        if not token or not cookie:
            raise HTTPException(status_code=401, detail="登录信息不完整，请重新登录")

        is_searching = bool(keyword)
        params = {
            "sub": "search" if is_searching else "list",
            "search_field": "7" if is_searching else "null",
            "begin": begin,
            "count": count,
            "query": keyword or "",
            "fakeid": fakeid,
            "type": "101_1",
            "free_publish_type": 1,
            "sub_action": "list_ex",
            "token": token,
            "lang": "zh_CN",
            "f": "json",
            "ajax": 1,
        }
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": "https://mp.weixin.qq.com/",
            "Cookie": cookie,
        }

        result = await fetch_article_list_payload(
            params=params,
            headers=headers,
            timeout=30,
        )

        base_resp = result.get("base_resp", {})
        if base_resp.get("ret") != 0:
            error_msg = base_resp.get("err_msg", "未知错误")
            ret_code = base_resp.get("ret")
            print(f"[ERROR] WeChat API error: ret={ret_code}, msg={error_msg}")

            if is_login_expired(ret_code, error_msg):
                return ArticlesResponse(success=False, error=LOGIN_EXPIRED_MSG)
            if is_invalid_fakeid(ret_code, error_msg):
                return ArticlesResponse(
                    success=False,
                    error=(
                        "该公众号在微信侧已无法访问（可能已注销/改名/重新注册），"
                        "请重新搜索最新的同名公众号"
                    ),
                )
            return ArticlesResponse(
                success=False,
                error=f"获取文章列表失败: ret={ret_code}, msg={error_msg}",
            )

        publish_page = result.get("publish_page", {})
        if isinstance(publish_page, str):
            try:
                publish_page = json.loads(publish_page)
            except (json.JSONDecodeError, ValueError):
                return ArticlesResponse(
                    success=False,
                    error="数据格式错误: publish_page 无法解析",
                )
        if not isinstance(publish_page, dict):
            return ArticlesResponse(
                success=False,
                error=f"数据格式错误: publish_page 类型为 {type(publish_page).__name__}",
            )

        articles: List[Dict] = []
        for item in publish_page.get("publish_list", []):
            publish_info = item.get("publish_info", {})
            if isinstance(publish_info, str):
                try:
                    publish_info = json.loads(publish_info)
                except (json.JSONDecodeError, ValueError):
                    continue
            if not isinstance(publish_info, dict):
                continue
            for article in publish_info.get("appmsgex", []):
                articles.append(
                    {
                        "aid": article.get("aid", ""),
                        "title": article.get("title", ""),
                        "link": article.get("link", ""),
                        "update_time": article.get("update_time", 0),
                        "create_time": article.get("create_time", 0),
                        "digest": article.get("digest", ""),
                        "cover": article.get("cover", ""),
                        "author": article.get("author", ""),
                    }
                )

        return ArticlesResponse(
            success=True,
            data={
                "articles": articles,
                "total": publish_page.get("total_count", 0),
                "begin": begin,
                "count": len(articles),
                "keyword": keyword,
            },
        )
    except HTTPException:
        raise
    except ArticleListError as exc:
        print(f"[ERROR] article list provider unavailable: {exc}")
        return ArticlesResponse(success=False, error=str(exc))
    except Exception as exc:
        print(f"[ERROR] unknown article list error: {type(exc).__name__}")
        return ArticlesResponse(success=False, error="服务器内部错误，请稍后重试")


@router.get("/articles/search", response_model=ArticlesResponse, summary="搜索公众号文章")
async def search_articles(
    fakeid: str = Query(..., description="目标公众号的 FakeID"),
    query: str = Query(..., description="搜索关键词", alias="query"),
    begin: int = Query(0, description="偏移量，默认 0", ge=0, alias="begin"),
    count: int = Query(10, description="获取数量，默认 10，最大 100", ge=1, le=100),
):
    return await get_articles(
        fakeid=fakeid,
        keyword=query,
        begin=begin,
        count=count,
    )
