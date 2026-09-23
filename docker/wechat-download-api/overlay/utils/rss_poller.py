#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Copyright (C) 2026 tmwgsicp
# Licensed under the GNU Affero General Public License v3.0
# See https://github.com/tmwgsicp/wechat-download-api for full source.
# SPDX-License-Identifier: AGPL-3.0-only
"""RSS poller using the shared proxy-required article-list client."""

import asyncio
import json
import logging
import os
from typing import Dict, List, Optional

from utils import rss_store
from utils.article_list_client import ArticleListError, fetch_article_list_payload
from utils.auth_manager import auth_manager
from utils.helpers import (
    get_unavailable_reason,
    has_article_content,
    is_article_unavailable,
)

logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.getenv("RSS_POLL_INTERVAL", "3600"))
ARTICLES_PER_POLL = int(os.getenv("ARTICLES_PER_POLL", "10"))
FETCH_FULL_CONTENT = os.getenv("RSS_FETCH_FULL_CONTENT", "true").lower() == "true"


class WechatInvalidFakeidError(Exception):
    """The provider reports a permanently invalid fakeid."""


class WechatArticleListResponseError(ArticleListError):
    """The provider returned a non-success response other than invalid fakeid."""


class RSSPoller:
    _instance = None
    _task: Optional[asyncio.Task] = None
    _running = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("RSS poller started (interval=%ds)", POLL_INTERVAL)

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("RSS poller stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    async def _loop(self):
        while self._running:
            try:
                await self._poll_all()
            except Exception as exc:
                logger.error("RSS poll cycle error: %s", exc, exc_info=True)
            await asyncio.sleep(POLL_INTERVAL)

    async def _poll_all(self):
        fakeids = rss_store.get_all_fakeids()
        if not fakeids:
            return

        creds = auth_manager.get_credentials()
        if not creds or not creds.get("token") or not creds.get("cookie"):
            logger.warning("RSS poll skipped: not logged in")
            return

        blacklisted = set(rss_store.get_active_blacklist_fakeids())
        active_fakeids = [fakeid for fakeid in fakeids if fakeid not in blacklisted]
        skipped = len(fakeids) - len(active_fakeids)
        if skipped > 0:
            logger.info(
                "RSS poll: %d subscriptions (%d blacklisted, skipped)",
                len(fakeids),
                skipped,
            )
        else:
            logger.info("RSS poll: checking %d subscriptions", len(fakeids))

        for fakeid in active_fakeids:
            try:
                articles = await self._fetch_article_list(fakeid, creds)
                if articles and FETCH_FULL_CONTENT:
                    articles = await self._enrich_articles_content(fakeid, articles)

                if articles:
                    new_count = rss_store.save_articles(fakeid, articles, source="poll")
                    if new_count > 0:
                        logger.info("RSS: %d new articles for %s", new_count, fakeid[:8])
                rss_store.update_last_poll(fakeid)
            except WechatInvalidFakeidError:
                sub = rss_store.get_subscription(fakeid)
                nickname = sub.get("nickname", "") if sub else ""
                logger.warning(
                    "Fakeid %s (%s) is invalid on WeChat, adding to blacklist",
                    fakeid[:8],
                    nickname,
                )
                try:
                    rss_store.add_to_blacklist(
                        fakeid,
                        nickname=nickname,
                        reason="invalid_fakeid",
                        note=(
                            "[2026-05-18] 微信侧返回 invalid args，"
                            "fakeid 已失效（注销/改名/重新注册）"
                        ),
                    )
                except Exception as exc:
                    logger.warning(
                        "Failed to blacklist invalid fakeid %s: %s",
                        fakeid[:8],
                        type(exc).__name__,
                    )
            except ArticleListError as exc:
                # Proxy and provider circuit failures apply to every subscription.
                # Stop this cycle without advancing last_poll or fanning out.
                logger.error("RSS article-list cycle stopped for %s: %s", fakeid[:8], exc)
                break
            except Exception as exc:
                logger.error("RSS poll error for %s: %s", fakeid[:8], exc)
            await asyncio.sleep(3)

    async def _fetch_article_list(self, fakeid: str, creds: Dict) -> List[Dict]:
        params = {
            "sub": "list",
            "search_field": "null",
            "begin": 0,
            "count": ARTICLES_PER_POLL,
            "query": "",
            "fakeid": fakeid,
            "type": "101_1",
            "free_publish_type": 1,
            "sub_action": "list_ex",
            "token": creds["token"],
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
            "Cookie": creds["cookie"],
        }
        result = await fetch_article_list_payload(
            params=params,
            headers=headers,
            timeout=30,
        )

        base_resp = result.get("base_resp", {})
        if base_resp.get("ret") != 0:
            ret_code = base_resp.get("ret")
            err_msg = str(base_resp.get("err_msg", ""))[:200]
            logger.warning(
                "WeChat API error for %s: ret=%s err_msg=%r",
                fakeid[:8],
                ret_code,
                err_msg,
            )
            if ret_code == 200002 and "invalid arg" in err_msg.lower():
                raise WechatInvalidFakeidError(
                    f"fakeid {fakeid[:8]} 已失效（注销/改名）: {err_msg}"
                )
            raise WechatArticleListResponseError(
                f"wechat article-list provider error: ret={ret_code}, msg={err_msg}"
            )

        publish_page = result.get("publish_page", {})
        if isinstance(publish_page, str):
            try:
                publish_page = json.loads(publish_page)
            except (json.JSONDecodeError, ValueError) as exc:
                raise WechatArticleListResponseError(
                    "wechat article-list publish_page is invalid JSON"
                ) from exc
        if not isinstance(publish_page, dict):
            raise WechatArticleListResponseError(
                "wechat article-list publish_page is not an object"
            )

        articles = []
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
                        "digest": article.get("digest", ""),
                        "cover": article.get("cover", ""),
                        "author": article.get("author", ""),
                        "publish_time": article.get("update_time", 0),
                    }
                )
        return articles

    async def poll_now(self):
        await self._poll_all()

    async def _enrich_articles_content(
        self,
        fakeid: str,
        articles: List[Dict],
    ) -> List[Dict]:
        from utils.article_fetcher import fetch_articles_batch
        from utils.content_processor import process_article_content

        article_links = [article.get("link", "") for article in articles if article.get("link")]
        if not article_links:
            return articles

        max_fetch = 20
        if len(article_links) > max_fetch:
            logger.info(
                "文章数 %d 篇超过限制，仅获取最近 %d 篇的完整内容",
                len(article_links),
                max_fetch,
            )
            article_links = article_links[:max_fetch]
            articles = articles[:max_fetch]

        logger.info("开始批量获取 %d 篇文章的完整内容", len(article_links))
        results = await fetch_articles_batch(
            article_links,
            max_concurrency=3,
            timeout=60,
            wechat_token=os.getenv("WECHAT_TOKEN", ""),
            wechat_cookie=os.getenv("WECHAT_COOKIE", ""),
        )

        enriched = []
        for article in articles:
            link = article.get("link", "")
            if not link:
                enriched.append(article)
                continue

            html = results.get(link)
            if not html:
                logger.warning("Empty HTML: %s", link[:80])
                enriched.append(article)
                continue

            html_lower = html.lower()
            verification_markers = (
                "verifycode" in html_lower
                or "请输入图片中的字符" in html
                or "环境异常" in html
            )
            if verification_markers:
                sub = rss_store.get_subscription(fakeid)
                nickname = sub.get("nickname", "") if sub else ""
                count = rss_store.increment_verification_count(fakeid, nickname)
                logger.warning(
                    "Verification triggered for %s (count=%d): %s",
                    fakeid[:8],
                    count,
                    link[:60],
                )
                enriched.append(article)
                continue

            if is_article_unavailable(html):
                reason = get_unavailable_reason(html) or "unknown"
                logger.warning("Article permanently unavailable (%s): %s", reason, link[:80])
                article["content"] = f"<p>[unavailable] {reason}</p>"
                article["plain_content"] = f"[unavailable] {reason}"
                enriched.append(article)
                continue
            if not has_article_content(html):
                logger.warning("No content in HTML: %s", link[:80])
                enriched.append(article)
                continue

            try:
                site_url = os.getenv("SITE_URL", "http://localhost:5000").rstrip("/")
                result = process_article_content(html, proxy_base_url=site_url)
                article["content"] = result.get("content", "")
                article["plain_content"] = result.get("plain_content", "")
                if not article.get("author"):
                    from utils.helpers import extract_article_info, parse_article_url

                    article_info = extract_article_info(html, parse_article_url(link))
                    article["author"] = article_info.get("author", "")
                logger.info(
                    "Content fetched: %s... (%d chars, %d images)",
                    link[:50],
                    len(article["content"]),
                    len(result.get("images", [])),
                )
            except Exception as exc:
                logger.error(
                    "Failed to process content for %s: %s",
                    link[:80],
                    type(exc).__name__,
                )
            enriched.append(article)
        return enriched


rss_poller = RSSPoller()
