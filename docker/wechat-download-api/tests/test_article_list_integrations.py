import unittest
from unittest import mock

from routes import articles as articles_route
from utils import rss_poller as rss_module
from utils.article_list_client import ArticleListCircuitOpenError


SUCCESS_PAYLOAD = {
    "base_resp": {"ret": 0},
    "publish_page": {
        "total_count": 1,
        "publish_list": [
            {
                "publish_info": {
                    "appmsgex": [
                        {
                            "aid": "aid-1",
                            "title": "Title",
                            "link": "https://example.test/article",
                            "update_time": 123,
                            "create_time": 122,
                            "digest": "Digest",
                            "cover": "cover",
                            "author": "Author",
                        }
                    ]
                }
            }
        ],
    },
}


class RouteIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_articles_uses_shared_client(self):
        with mock.patch.object(
            articles_route.auth_manager,
            "get_credentials",
            return_value={"token": "token", "cookie": "cookie"},
        ), mock.patch.object(
            articles_route,
            "fetch_article_list_payload",
            mock.AsyncMock(return_value=SUCCESS_PAYLOAD),
        ) as shared_client:
            response = await articles_route.get_articles(
                fakeid="fakeid",
                begin=0,
                count=1,
                keyword=None,
            )
        self.assertTrue(response.success)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(shared_client.await_count, 1)

    async def test_public_articles_returns_circuit_failure_without_fallback(self):
        with mock.patch.object(
            articles_route.auth_manager,
            "get_credentials",
            return_value={"token": "token", "cookie": "cookie"},
        ), mock.patch.object(
            articles_route,
            "fetch_article_list_payload",
            mock.AsyncMock(
                side_effect=ArticleListCircuitOpenError(
                    "wechat_appmsgpublish circuit open until 2026-08-27T00:00:00+00:00"
                )
            ),
        ):
            response = await articles_route.get_articles(
                fakeid="fakeid",
                begin=0,
                count=1,
                keyword=None,
            )
        self.assertFalse(response.success)
        self.assertIn("circuit open", response.error)


class RSSIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_rss_fetch_uses_shared_client(self):
        poller = rss_module.RSSPoller()
        with mock.patch.object(
            rss_module,
            "fetch_article_list_payload",
            mock.AsyncMock(return_value=SUCCESS_PAYLOAD),
        ) as shared_client:
            result = await poller._fetch_article_list(
                "fakeid",
                {"token": "token", "cookie": "cookie"},
            )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["title"], "Title")
        self.assertEqual(shared_client.await_count, 1)

    async def test_rss_circuit_failure_stops_cycle_without_advancing_last_poll(self):
        poller = rss_module.RSSPoller()
        fetch = mock.AsyncMock(
            side_effect=ArticleListCircuitOpenError("provider circuit open")
        )
        with mock.patch.object(
            rss_module.rss_store,
            "get_all_fakeids",
            return_value=["first-fakeid", "second-fakeid"],
        ), mock.patch.object(
            rss_module.rss_store,
            "get_active_blacklist_fakeids",
            return_value=[],
        ), mock.patch.object(
            rss_module.rss_store,
            "update_last_poll",
        ) as update_last_poll, mock.patch.object(
            rss_module.auth_manager,
            "get_credentials",
            return_value={"token": "token", "cookie": "cookie"},
        ), mock.patch.object(poller, "_fetch_article_list", fetch):
            await poller._poll_all()

        self.assertEqual(fetch.await_count, 1)
        fetch.assert_awaited_once_with(
            "first-fakeid",
            {"token": "token", "cookie": "cookie"},
        )
        update_last_poll.assert_not_called()


if __name__ == "__main__":
    unittest.main()
