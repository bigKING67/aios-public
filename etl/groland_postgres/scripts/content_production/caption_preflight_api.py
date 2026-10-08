"""Permission adapter for the existing authenticated Rust API; no stored tokens."""
from urllib.parse import urlsplit
import uuid

import requests

from .caption_preflight_queue import consume_one
from .caption_preflight_run import authorize_run


class PermissionClient:
    operation = 'authorize'
    def __init__(self, base_url, access_token):
        url = urlsplit(base_url)
        if (url.username or url.password or url.query or url.fragment or not url.hostname
                or url.scheme not in ('http', 'https')
                or (url.scheme == 'http' and url.hostname not in ('127.0.0.1', '::1'))):
            raise ValueError('permission API requires HTTPS or loopback HTTP')
        self.base_url = base_url.rstrip('/')
        self.access_token = access_token

    def check(self, job, owner, snapshot):
        # The host supplies the current owner's session credential. Queue metadata
        # and claim tokens cannot mint, select or replace user authentication.
        token = self.access_token(job)
        if not isinstance(token, str) or not token.strip():
            raise PermissionError('caption owner credential unavailable')
        endpoint = f'{self.base_url}/caption-preflight-jobs/{uuid.UUID(str(job["job_id"]))}/{self.operation}'
        try:
            with requests.Session() as session:
                session.trust_env = False
                response = session.post(endpoint, headers={'Authorization': f'Bearer {token}'},
                    json={'claimToken': str(uuid.UUID(job['metadata']['caption_claim_token']))},
                    timeout=(3, 10), allow_redirects=False)
                if response.status_code != 200:
                    raise PermissionError('caption permission API rejected task')
                result = response.json()
        except (requests.RequestException, ValueError):
            # Do not include request headers, credentials or server error payloads.
            raise PermissionError('caption permission API unavailable') from None
        if (not isinstance(result, dict) or result.get('ownerUserId') != owner
                or result.get('sourceSnapshot') != snapshot):
            raise PermissionError('caption permission response does not match frozen Run')


class WorkerPermissionClient(PermissionClient):
    """Only the process which claimed this job possesses the short-lived secret."""
    operation = 'authorize-worker'

    def __init__(self, base_url):
        super().__init__(base_url, lambda job: job.get('authorization_secret'))


def consume_api_preflight(conn, storage, workspace, *, permissions, call_model, download_source=None):
    def authorize(job):
        return authorize_run(conn, job,
            authorize_sources=lambda owner, snapshot: permissions.check(job, owner, snapshot))
    return consume_one(conn, storage, workspace, authorize=authorize, call_model=call_model,
                       download_source=download_source)
