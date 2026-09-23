import asyncio
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from utils import http_client
from utils.article_list_client import (
    ArticleListCircuitOpenError,
    ArticleListRateLimitedError,
    ProviderCircuit,
    fetch_article_list_payload,
)
from utils.proxy_pool import ProxyPool, redact_proxy_url


class FakeProxyPool:
    def __init__(self, proxies):
        self.proxies = list(proxies)
        self.failed = []
        self.ok = []

    @property
    def count(self):
        return len(self.proxies)

    @property
    def enabled(self):
        return bool(self.proxies)

    def next(self):
        return self.proxies.pop(0) if self.proxies else None

    def mark_failed(self, proxy):
        self.failed.append(proxy)

    def mark_ok(self, proxy):
        self.ok.append(proxy)


class ProxyPolicyTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_proxy_policy_blocks_before_network(self):
        request = mock.AsyncMock()
        with mock.patch.dict(os.environ, {"WECHAT_PROXY_REQUIRED": "treu"}):
            with self.assertRaises(http_client.ProxyUnavailableError):
                await http_client._request_with_proxy_policy("https://example.test", request)
        request.assert_not_awaited()

    def test_authenticated_json_transport_verifies_tls_and_blocks_redirects(self):
        session = mock.MagicMock()
        session.get.return_value.json.return_value = {"base_resp": {"ret": 0}}
        factory = mock.MagicMock()
        factory.return_value.__enter__.return_value = session
        with mock.patch.object(http_client, "CurlSession", factory):
            http_client._fetch_curl_cffi_json_sync(
                "https://example.test", {}, {"Cookie": "fixture"}, 30, None
            )
        self.assertTrue(session.get.call_args.kwargs["verify"])
        self.assertFalse(session.get.call_args.kwargs["allow_redirects"])

    async def test_required_proxy_without_configuration_never_calls_direct(self):
        pool = FakeProxyPool([])
        request = mock.AsyncMock()
        with mock.patch.dict(os.environ, {"WECHAT_PROXY_REQUIRED": "true"}), mock.patch.object(
            http_client, "HAS_CURL_CFFI", True
        ), mock.patch.object(http_client, "proxy_pool", pool):
            with self.assertRaises(http_client.ProxyUnavailableError):
                await http_client._request_with_proxy_policy("https://example.test", request)
        request.assert_not_awaited()

    async def test_failed_required_proxy_never_falls_back_to_direct(self):
        proxy = "socks5://user:secret@proxy.example:1080"
        pool = FakeProxyPool([proxy])
        request = mock.AsyncMock(side_effect=RuntimeError("transport failed"))
        with mock.patch.dict(os.environ, {"WECHAT_PROXY_REQUIRED": "true"}), mock.patch.object(
            http_client, "HAS_CURL_CFFI", True
        ), mock.patch.object(http_client, "proxy_pool", pool):
            with self.assertRaises(http_client.ProxyUnavailableError):
                await http_client._request_with_proxy_policy("https://example.test", request)
        request.assert_awaited_once_with(proxy)
        self.assertEqual(pool.failed, [proxy])
        self.assertNotIn(mock.call(None), request.await_args_list)

    def test_proxy_status_redacts_credentials(self):
        raw = "socks5://user:secret@proxy.example:1080"
        self.assertEqual(
            redact_proxy_url(raw),
            "socks5://***:***@proxy.example:1080",
        )
        with mock.patch.dict(os.environ, {"PROXY_URLS": raw}, clear=False):
            pool = object.__new__(ProxyPool)
            pool._initialized = False
            ProxyPool.__init__(pool)
            status = pool.get_status()
        self.assertEqual(status["total"], 1)
        self.assertNotIn("user", json.dumps(status))
        self.assertNotIn("secret", json.dumps(status))


class ProviderCircuitTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_persisted_state_blocks_network(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "circuit.json"
            request = mock.AsyncMock()
            for status, retry in [("unknown", 1), ("open", None), ("open", float("nan"))]:
                path.write_text(json.dumps({
                    "provider": "wechat_appmsgpublish", "schema_version": 1,
                    "status": status, "retry_at_epoch": retry,
                }), encoding="utf-8")
                circuit = ProviderCircuit(path)
                with self.assertRaises(ArticleListCircuitOpenError):
                    await fetch_article_list_payload(
                        params={}, headers={}, circuit=circuit, request_json=request,
                    )
                self.assertFalse(circuit.public_status()["request_allowed"])
            request.assert_not_awaited()

    async def test_rate_limit_persists_and_blocks_later_request_without_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            clock = [1000.0]
            path = Path(directory) / "circuit.json"
            circuit = ProviderCircuit(
                path,
                cooldown_seconds=60,
                now=lambda: clock[0],
            )
            request = mock.AsyncMock(
                return_value={"base_resp": {"ret": 200013, "err_msg": "sensitive-token sensitive-cookie"}}
            )
            params = {"token": "sensitive-token", "fakeid": "sensitive-fakeid"}
            headers = {"Cookie": "sensitive-cookie"}

            with self.assertRaises(ArticleListRateLimitedError):
                await fetch_article_list_payload(
                    params=params,
                    headers=headers,
                    circuit=circuit,
                    request_json=request,
                )
            with self.assertRaises(ArticleListCircuitOpenError):
                await fetch_article_list_payload(
                    params=params,
                    headers=headers,
                    circuit=circuit,
                    request_json=request,
                )

            self.assertEqual(request.await_count, 1)
            state_text = path.read_text(encoding="utf-8")
            state = json.loads(state_text)
            self.assertEqual(state["status"], "open")
            self.assertEqual(state["ret"], 200013)
            self.assertEqual(state["retry_at_epoch"], 1060.0)
            self.assertNotIn("sensitive-token", state_text)
            self.assertNotIn("sensitive-cookie", state_text)
            self.assertNotIn("sensitive-fakeid", state_text)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    async def test_expired_circuit_allows_only_one_serialized_probe(self):
        with tempfile.TemporaryDirectory() as directory:
            clock = [1000.0]
            circuit = ProviderCircuit(
                Path(directory) / "circuit.json",
                cooldown_seconds=10,
                now=lambda: clock[0],
            )
            circuit.open_rate_limit("freq control")
            clock[0] = 1011.0
            entered = asyncio.Event()
            release = asyncio.Event()

            async def request(*args, **kwargs):
                entered.set()
                await release.wait()
                return {"base_resp": {"ret": 0}, "publish_page": {"publish_list": []}}

            first = asyncio.create_task(
                fetch_article_list_payload(
                    params={},
                    headers={},
                    circuit=circuit,
                    request_json=request,
                )
            )
            await entered.wait()
            second = asyncio.create_task(
                fetch_article_list_payload(
                    params={},
                    headers={},
                    circuit=circuit,
                    request_json=request,
                )
            )
            await asyncio.sleep(0)
            release.set()
            first_result = await first
            self.assertEqual(first_result["base_resp"]["ret"], 0)
            with self.assertRaises(ArticleListCircuitOpenError):
                await second
            self.assertEqual(circuit.read()["status"], "closed")

    async def test_failed_expired_probe_is_deferred_without_clearing_incident(self):
        with tempfile.TemporaryDirectory() as directory:
            clock = [1000.0]
            circuit = ProviderCircuit(
                Path(directory) / "circuit.json",
                cooldown_seconds=10,
                probe_retry_seconds=5,
                now=lambda: clock[0],
            )
            circuit.open_rate_limit("freq control")
            clock[0] = 1011.0
            request = mock.AsyncMock(side_effect=RuntimeError("proxy down"))
            with self.assertRaisesRegex(Exception, "required proxy"):
                await fetch_article_list_payload(
                    params={},
                    headers={},
                    circuit=circuit,
                    request_json=request,
                )
            state = circuit.read()
            self.assertEqual(state["status"], "open")
            self.assertEqual(state["ret"], 200013)
            self.assertEqual(state["retry_at_epoch"], 1016.0)


if __name__ == "__main__":
    unittest.main()
