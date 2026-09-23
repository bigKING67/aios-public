# AIOS derived wechat-download-api

This directory is a minimal, reviewable overlay on official
[`tmwgsicp/wechat-download-api` v1.7.0](https://github.com/tmwgsicp/wechat-download-api/tree/v1.7.0).
It is not a second copy of the whole upstream repository.

## Provenance and license

- Upstream tag: `v1.7.0`
- Upstream commit: `fd70a886a82a8838312e2439bb0eed1c2e1ad00b`
- Upstream image manifest:
  `tmwgsicp/wechat-download-api@sha256:6977f00af2334af4a8dc9ed19d0a82a5214fd4eca4d1c724f7d14b1299cc66ec`
- License: `AGPL-3.0-only`
- License text: `LICENSE` (also copied into the derived image)
- Exact replaced-file hashes: `upstream.lock.json`

The overlay files retain the upstream AGPL headers. The complete corresponding
upstream source is available at the tag/commit above; this directory contains
all AIOS modifications applied to it.

## Runtime contract

Read [CONTRACTS.md](./CONTRACTS.md) for the complete executable contract.
TLS certificates are verified. Authenticated JSON requests reject redirects;
invalid proxy booleans and malformed circuit state block network access.

- `/api/public/articles` and the RSS list poller share
  `utils.article_list_client.fetch_article_list_payload`.
- `WECHAT_PROXY_REQUIRED=true` is the production default. Missing, cooling or
  failed proxies never fall back to a direct request.
- `PROXY_URLS` stays in the VPS private env. Logs and health responses redact
  credentials.
- `ret=200013` opens a provider-wide persisted circuit. Default cooldown is 24
  hours; calls during the cooldown do not reach WeChat.
- The current runtime contract is one Uvicorn worker. Do not add multiple
  workers without replacing the in-process serialization with a cross-process
  lock.

Documented non-secret keys:

```dotenv
WECHAT_PROXY_REQUIRED=true
WECHAT_LIST_RATE_LIMIT_COOLDOWN_SECONDS=86400
WECHAT_LIST_PROBE_RETRY_SECONDS=300
WECHAT_LIST_CIRCUIT_PATH=/app/data/wechat-list-provider-circuit.json
```

These defaults are implemented in the overlay rather than Docker `ENV`, so the
upstream startup `load_dotenv()` can honor VPS-private `.env` overrides before
the patched modules are imported. Production must keep proxy-required enabled.

`PROXY_URLS` is intentionally omitted from examples because it may contain
credentials. Configure exactly one controlled remote egress for the first
production canary. A proxy on the same VPS is not a different egress.

## Build and verify

From the AIOS repository root:

```bash
bash scripts/ops/build-wechat-download-api-derived.sh
```

The script builds the `test` target (running all in-image regressions), builds
the production target, verifies the pinned-upstream label and prints the local
immutable `IMAGE_ID`. It defaults to `linux/amd64`, matching the official image
and the VPS; override only through `WECHAT_DERIVED_PLATFORM`. The source-derived
tag is for inspection only; production compose must select the immutable image
ID recorded on that VPS.

## Production canary gate

Before changing the private compose/env, prove all of the following:

1. AIOS local/origin/VPS SHA parity and a clean VPS checkout.
2. The derived image was built from the reviewed pushed commit and its test
   target passed.
3. Discovery and content-retry Prefect schedules are paused.
4. Private env contains one proxy; redacted `/api/health` reports
   `proxy_required=true`, `http_engine=curl_cffi`, and proxy total/healthy `1`.
5. No article-list request is in flight and circuit state is closed/absent, or
   an expired circuit is intentionally being probed once.

The canary is one existing source, `begin=0`, `count=1`, and exactly one HTTP
request to `/api/public/articles`. Do not retry it automatically. Regardless of
the outcome, do not resume discovery or content-retry schedules.

Rollback selects the prior official v1.7.0 manifest in the VPS private compose,
restarts only `wechat-download-api`, and rechecks health/login while schedules
remain paused. Do not delete `/app/data` or article data.
