"""视频云管家 OpenAPI client: signed reads and explicitly non-retrying writes.

Credentials come from the environment (CLOUD_VIDEO_BASE_URL, CLOUD_VIDEO_COMPANY_KEY,
CLOUD_VIDEO_COMPANY_SECRET) and are never logged. `/openapi/video/query/raw` is deliberately not
offered: the vendor counts each call as a download. See docs/AI_STUDIO_CLOUD_VIDEO_API.md.
"""
import concurrent.futures
import contextlib
import collections
import fcntl
import hashlib
import http.client
import json
import os
import secrets
import socket
import ssl
import string
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

TOKEN_TTL_SECONDS = 23 * 3600  # the vendor states 24 hours; refresh an hour early
TOKEN_ERRORS = {20013, 20014}  # accessToken expired / wrong
RATE_LIMITED = 20002
PAGE_SIZE = 100
# The vendor's contract (协议 4.1-4.3): at most 100 calls a minute and 10 concurrent, a 30 s timeout and
# at most 3 retries per call; past it the vendor may suspend the company. Every HTTP request, retries
# included, counts. Only one process calls at a time (api_lock), with at most MAX_CONCURRENCY requests in
# flight and RATE_PER_MINUTE in any 60 s. The window slides, so no vendor minute, however it is cut, sees
# more than RATE_PER_MINUTE (80 of 100 since 2026-10-30, owner decision). Concurrency is back at 3: at 6 each
# call took ~2.4 s instead of ~1.5 s and throughput did not rise (2026-10-30 backfill).
TIMEOUT_SECONDS = 30
MAX_RETRIES = 3
RATE_PER_MINUTE = 80
MAX_CONCURRENCY = 3
LOCK_WAIT_SECONDS = 3600
DEFAULT_LOCK_FILE = '~/aios-worker/work/cloud-video-api.lock'


@contextlib.contextmanager
def api_lock(path=None, *, wait=LOCK_WAIT_SECONDS, poll=5.0, sleep=time.sleep):
    """Holds the host-wide 视频云管家 lock: every syncing process takes it first, so two of them never
    add up past the vendor's limits. Waits up to `wait` seconds for another holder to finish."""
    path = os.path.expanduser(path or os.getenv('CLOUD_VIDEO_LOCK_FILE') or DEFAULT_LOCK_FILE)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'a') as handle:
        waited = 0.0
        while True:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if waited >= wait:
                    raise TimeoutError(f'另一个视频云管家同步仍在运行（{path}）') from None
                sleep(poll)
                waited += poll
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


class CloudVideoError(RuntimeError):
    def __init__(self, code, info, path):
        super().__init__(f'{path}: code={code} info={info}')
        self.code, self.info, self.path = code, info, path


def sign(params, secret):
    """The vendor's signature: params sorted by key, values URL-encoded with upper-case hex, then
    `&company_secret=<secret>`, MD5, upper case. Nested values (lists, dicts) and `sign` do not take part."""
    pairs = '&'.join(f'{key}={urllib.parse.quote(str(value), safe="")}'
                     for key, value in sorted(params.items())
                     if key != 'sign' and value is not None and not isinstance(value, (dict, list)))
    return hashlib.md5(f'{pairs}&company_secret={secret}'.encode()).hexdigest().upper()


# The desktop runs Clash in TUN mode with fake-IP DNS: a name resolved through the system becomes a Clash
# address and the request then travels however the proxy rules say (API calls through a proxy node failed
# about one in three, 2026-10-29; the inner file server is only reachable directly). So every request
# resolves its host itself (public DNS over HTTPS, by IP) and connects to that address directly, verifying
# the certificate against the host name. Nothing depends on proxy rules.
DOH_URL = 'https://223.5.5.5/resolve?name={host}&type=A'
_resolved = {}


def real_address(host, opener=urllib.request.urlopen):
    """The host's A record from public DNS (cached per process); None when it cannot be resolved."""
    name = host.split(':', 1)[0]
    if name not in _resolved:
        try:
            with opener(DOH_URL.format(host=urllib.parse.quote(name)), timeout=10) as response:
                answers = [a['data'] for a in json.loads(response.read()).get('Answer') or [] if a.get('type') == 1]
            _resolved[name] = answers[-1] if answers else None
        except Exception:  # noqa: BLE001 - fall back to the system resolver
            _resolved[name] = None
    return _resolved[name]


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """HTTPS to a fixed IP, with SNI and certificate checks for the original host name."""

    def __init__(self, host, address, **kwargs):
        super().__init__(host, **kwargs)
        self._address = address

    def connect(self):
        sock = socket.create_connection((self._address, self.port or 443), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def pinned_open(url, timeout=TIMEOUT_SECONDS, *, method='GET', body=None, headers=None):
    """Requests `url`, connecting to the host's public-DNS address when it has one; follows no redirects."""
    parsed = urllib.parse.urlparse(url)
    address = real_address(parsed.netloc)
    if not address or parsed.scheme != 'https':
        return urllib.request.urlopen(urllib.request.Request(url, data=body, method=method, headers=headers or {}),
                                      timeout=timeout)
    connection = _PinnedHTTPSConnection(parsed.hostname, address, port=parsed.port, timeout=timeout,
                                        context=ssl.create_default_context())
    connection.request(method, parsed.path + (f'?{parsed.query}' if parsed.query else ''), body=body, headers=headers or {})
    response = connection.getresponse()
    if response.status != 200:
        connection.close()
        raise RuntimeError(f'HTTP {response.status}')
    return contextlib.closing(response)


class Transport:
    """POST JSON over HTTPS; replaced by a fake in tests."""

    def post(self, url, headers, body):
        with pinned_open(url, TIMEOUT_SECONDS, method='POST', body=json.dumps(body).encode(),
                         headers={**headers, 'Content-Type': 'application/json'}) as response:
            return json.loads(response.read())


class CloudVideoClient:
    def __init__(self, base_url, company_key, company_secret, *, transport=None, clock=time.time, sleep=time.sleep):
        self.base_url = base_url.rstrip('/')
        self.company_key, self._secret = company_key, company_secret
        self.transport, self.clock, self.sleep = transport or Transport(), clock, sleep
        self._token, self._token_at, self._account = None, 0.0, None
        self._sent = collections.deque()
        self._rate_lock, self._auth_lock = threading.Lock(), threading.Lock()

    @classmethod
    def from_env(cls):
        missing = [k for k in ('CLOUD_VIDEO_BASE_URL', 'CLOUD_VIDEO_COMPANY_KEY', 'CLOUD_VIDEO_COMPANY_SECRET') if not os.getenv(k)]
        if missing:
            raise RuntimeError(f'视频云管家未配置：{"、".join(missing)}')
        return cls(os.environ['CLOUD_VIDEO_BASE_URL'], os.environ['CLOUD_VIDEO_COMPANY_KEY'], os.environ['CLOUD_VIDEO_COMPANY_SECRET'])

    def _headers(self, body, token=None, account=None):
        headers = {'company_key': self.company_key, 'timestamp': str(int(self.clock())),
                   'nonce': ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))}
        if token:
            headers['access_token'] = token
        if account:
            headers['account_key'] = account
        headers['sign'] = sign({**headers, **body}, self._secret)
        return headers

    def _throttle(self):
        """Waits until one more request keeps the last 60 s within RATE_PER_MINUTE. Threads queue on the
        lock, so concurrent callers share one budget."""
        with self._rate_lock:
            now = self.clock()
            while self._sent and now - self._sent[0] >= 60:
                self._sent.popleft()
            if len(self._sent) >= RATE_PER_MINUTE:
                wait = self._sent.popleft() + 60 - now
                self.sleep(wait)
                now += wait
            self._sent.append(now)

    def _post(self, path, body, *, token=None, account=None):
        """One HTTP request."""
        self._throttle()
        payload = self.transport.post(self.base_url + path, self._headers(body, token, account), body)
        if payload.get('code') != 1 or not payload.get('success'):
            raise CloudVideoError(payload.get('code'), payload.get('info'), path)
        return payload.get('data')

    def _retrying(self, send):
        """`send()` with at most MAX_RETRIES retries: dropped connections (the desktop's Clash TUN
        occasionally cuts TLS, even to a pinned address) and rate limits back off, a rejected token is
        fetched again. All offered calls are reads, so repeating one is safe."""
        for attempt in range(MAX_RETRIES + 1):
            try:
                return send()
            except (OSError, http.client.HTTPException):
                if attempt == MAX_RETRIES:
                    raise
                self.sleep(2 ** attempt)
            except CloudVideoError as error:
                if attempt == MAX_RETRIES or error.code not in TOKEN_ERRORS | {RATE_LIMITED}:
                    raise
                if error.code in TOKEN_ERRORS:
                    self._token = None
                else:
                    self.sleep(2 ** attempt)

    def token(self):
        with self._auth_lock:
            if not self._token or self.clock() - self._token_at > TOKEN_TTL_SECONDS:
                self._token = self._post('/openapi/auth/access_token', {})['accessToken']
                self._token_at = self.clock()
            return self._token

    def account(self):
        """The first enabled user: business calls need an account_key (all users see the company's videos)."""
        if not self._account:
            token = self.token()
            with self._auth_lock:
                if not self._account:
                    data = self._post('/openapi/account/list', {'pageNo': 1, 'pageSize': 1, 'state': 1}, token=token)
                    rows = data.get('list') or []
                    if not rows:
                        raise CloudVideoError(None, '没有可用的用户', '/openapi/account/list')
                    self._account = rows[0]['accountKey']
        return self._account

    def call(self, path, body, *, account=True):
        """A business call (token and account attached). The token and account requests it may need are
        single requests inside the same retry budget, so no failure is retried more than MAX_RETRIES times."""
        return self._retrying(lambda: self._post(path, body, token=self.token(),
                                                 account=self.account() if account else None))

    def write_once(self, path, body):
        """Resolve read-only authentication first, then send exactly one write.

        Transport failure or an unrecognized response is an uncertain outcome,
        never permission to repeat an import. The caller owns reconciliation.
        """
        token, account = self._retrying(lambda: (self.token(), self.account()))
        return self._post(path, body, token=token, account=account)

    def each(self, fn, items, *, workers=MAX_CONCURRENCY):
        """[fn(item) for item in items] with at most `workers` (≤ MAX_CONCURRENCY) running at once; the
        first failure is raised after the running ones finish."""
        items = list(items)
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(workers, MAX_CONCURRENCY))) as pool:
            return list(pool.map(fn, items))

    def video_pages(self, body):
        """Every row of a `/openapi/video/list` query: page 1 alone, then the rest concurrently; with the
        vendor's total seen on every page, so a list that moved while it was read can be told apart."""
        first = self.call('/openapi/video/list', {**body, 'pageNo': 1, 'pageSize': PAGE_SIZE}) or {}
        pages = int(first.get('totalPage') or 0)
        rest = self.each(lambda page: self.call('/openapi/video/list', {**body, 'pageNo': page, 'pageSize': PAGE_SIZE}) or {},
                         range(2, pages + 1))
        rows = [row for data in [first, *rest] for row in data.get('list') or []]
        totals = {int(data.get('total') or 0) for data in [first, *rest]}
        return rows, totals

    def videos(self, body, *, max_pages=200, until=None):
        """Rows of a `/openapi/video/list` query, page by page (PAGE_SIZE rows each); stops after the
        first page for which `until(rows)` holds, or after the last page."""
        rows, page = [], 1
        while page <= max_pages:
            data = self.call('/openapi/video/list', {**body, 'pageNo': page, 'pageSize': PAGE_SIZE})
            batch = data.get('list') or []
            rows.extend(batch)
            if len(batch) < PAGE_SIZE or page >= int(data.get('totalPage') or 0) or (until and until(batch)):
                return rows
            page += 1
        raise CloudVideoError(None, f'超过 {max_pages} 页仍未取完', '/openapi/video/list')
