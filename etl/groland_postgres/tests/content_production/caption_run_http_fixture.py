"""Exercise the real host orchestrator against an isolated authenticated API."""
import json
import os
import sys
from urllib.parse import urlsplit

import requests

from content_production.caption_run import restore_run_captions, adopt_run_caption_candidate

url, action, reference = sys.argv[1:]
parsed = urlsplit(url)
if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1':
    raise ValueError('only disposable loopback HTTP fixture allowed')
base, run_id = url.rsplit('/runs/', 1)
session = requests.Session()
session.trust_env = False
session.headers['Authorization'] = 'Bearer ' + os.environ['AIOS_CAPTION_TEST_TOKEN']


def api(method, path, body=None):
    response = session.request(method, base + '/' + path, json=body, timeout=15, allow_redirects=False)
    if not response.ok or response.is_redirect:
        raise RuntimeError(f'fixture API returned {response.status_code}')
    return response.json()


if action == 'restore':
    result = restore_run_captions(api, run_id, reference_project_id=reference, reference_revision=1)
elif action == 'adopt':
    result = adopt_run_caption_candidate(api, run_id)
else:
    raise ValueError('unknown fixture action')
print(json.dumps(result, ensure_ascii=False))
