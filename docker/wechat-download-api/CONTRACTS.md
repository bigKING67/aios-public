# WeChat Article Provider

Required companion to the repository DataOps spec; read in full before changes.

## 1. Scope / Trigger

For `appmsgpublish` transport, proxy or circuit changes, edit the traceable
v1.7.0 overlay in `docker/wechat-download-api/`; never hot-edit VPS `/app` or
change account/source as a fallback.

## 2. Signatures

- API: `GET /api/public/articles?fakeid=<id>&begin=0&count=1`.
- Shared call: `fetch_article_list_payload(params=..., headers=..., timeout=30)`;
  the API and RSS poller must both use it.
- Build: `bash scripts/ops/build-wechat-download-api-derived.sh`;
  default=`linux/amd64`, production authority=VPS-local immutable image ID.

## 3. Contracts

- Pin source/image/hashes in `docker/wechat-download-api/upstream.lock.json`.
- Production requires `WECHAT_PROXY_REQUIRED=true` plus one private
  `PROXY_URLS`; never print or commit its value.
- Invalid proxy booleans fail before network access. TLS certificates are
  verified; authenticated JSON requests do not follow redirects.
- Invalid circuit schema/status/deadline blocks requests and health reports
  `request_allowed=false`. Persist a fixed reason, never upstream error text.
- Cooldown/probe defaults are `86400`/`300`; circuit state under `/app/data` is
  mode 0600 and contains no cookie, token, fakeid or proxy URL.

## 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| no/cooling/failed proxy or no `curl_cffi` | fail closed; no direct call |
| `ret=200013` or open before retry | persist/keep circuit; no fan-out/network |
| expired circuit | one serialized probe; block queued probe |
| RSS list failure | no `last_poll`; stop remaining subscriptions |
| other provider response | close stale circuit; preserve caller semantics |

## 5. Good / Base / Bad Cases

- Good: one remote proxy, redacted health count=1, one list canary.
- Base: circuit closed/absent and schedules paused until canary.
- Bad: same-VPS proxy, rotation after 200013, direct fallback, automatic
  schedule resume, or persisted/logged credentials.

## 6. Tests Required

Docker `test` proves provenance, both callers, fail-closed/redaction, persisted
200013, single expired probe, and RSS no-last-poll/no-fan-out. Then inspect the
production image labels, architecture and ID.

## 7. Wrong vs Correct

```text
Wrong: proxy fails -> direct; 200013 -> another source/egress
Correct: proxy fails -> stop; 200013 -> cooldown; schedules stay paused
```
