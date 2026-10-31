"""Read-only business-link probes. Never enqueue jobs, write objects or call inference."""
import argparse
import ipaddress
import json
import os
import subprocess
import time


def peer_check(address):
    ipaddress.ip_address(address)
    try:
        result = subprocess.run(['tailscale', 'ping', '--until-direct=false', '--c', '1',
                                 '--timeout=5s', address], capture_output=True, timeout=8)
        return {'ok': result.returncode == 0}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {'ok': False, 'errorType': type(error).__name__}


def check():
    from marketing_content_assets.repository import connect_pg
    from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
    import requests

    checks, key = {}, None
    os.environ.setdefault('PGCONNECT_TIMEOUT', '5')
    started = time.monotonic()
    try:
        with connect_pg() as conn:
            conn.set_session(readonly=True)
            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout='5s'")
                cur.execute('SELECT 1')
                cur.fetchone()
                cur.execute("""SELECT evidence_objects->0->>'objectKey' FROM competitor.analyses
                  WHERE status IN ('succeeded','partial') AND jsonb_array_length(evidence_objects)>0
                  ORDER BY finished_at DESC LIMIT 1""")
                row = cur.fetchone()
                key = row[0] if row else None
                cur.execute("""SELECT
                  COUNT(*) FILTER (WHERE status='queued' AND source_sha256 IS NOT NULL
                    AND created_at < NOW()-INTERVAL '20 minutes'),
                  COUNT(*) FILTER (WHERE status='running' AND heartbeat_at < NOW()-INTERVAL '6 minutes'),
                  COUNT(*) FILTER (WHERE status='failed' AND finished_at > NOW()-INTERVAL '30 minutes'
                    AND error_code IN ('storage_retry_exhausted','lease_expired')),
                  COUNT(*) FILTER (WHERE status IN ('succeeded','partial')
                    AND finished_at > NOW()-INTERVAL '30 minutes'
                    AND card->'framework'->>'status'='unavailable')
                  FROM competitor.analyses WHERE status IN ('queued','running')
                    OR finished_at > NOW()-INTERVAL '30 minutes'""")
                stalled, lost, exhausted, degraded = cur.fetchone()
                checks['analysis_pipeline'] = {'ok': not (stalled or lost or exhausted or degraded),
                    'queuedOver20Min': stalled, 'staleLeases': lost,
                    'recentTransportFailures': exhausted, 'recentUnavailableFrameworks': degraded}
            conn.rollback()
        checks['database'] = {'ok': True, 'seconds': round(time.monotonic() - started, 3)}
    except Exception as error:
        checks['database'] = {'ok': False, 'errorType': type(error).__name__}
    if key:
        storage = None
        try:
            storage = TosStorageClient(TosStorageConfig.from_env())
            url, headers = storage._signed_url_and_headers('GET', key, {'range': 'bytes=0-1023'})
            with storage.session.get(url, headers=headers, stream=True, timeout=(5, 8)) as response:
                size = len(response.raw.read(1024)) if response.status_code in (200, 206) else 0
                checks['storage'] = {'ok': response.status_code in (200, 206) and size > 0,
                                     'httpStatus': response.status_code, 'readBytes': size}
        except Exception as error:
            checks['storage'] = {'ok': False, 'errorType': type(error).__name__}
        finally:
            if storage is not None:
                checks['storage']['transportMode'] = 'pinned_ip' if storage.config.connect_ip else 'system'
                if storage.config.connect_ip:
                    # This is the configured TCP target, not proof of the OS network route.
                    checks['storage']['configuredConnectIp'] = storage.config.connect_ip
                storage.session.close()
    else:
        checks['storage'] = {'ok': False, 'errorType': 'NoReadableEvidenceSample'}
    for name, env, suffix in [('asr', 'CONTENT_AI_STUDIO_LOCAL_ASR_URL', '/health'),
                              ('vlm', 'FRAMEWORK_V2_VLM_BASE_URL', '/models')]:
        base = os.getenv(env, '').rstrip('/')
        if not base:
            continue  # VPS fallback has no local models; do not invent an endpoint.
        try:
            with requests.Session() as session:
                session.trust_env = False
                if name == 'vlm':
                    session.headers['Authorization'] = 'Bearer ' + os.getenv('FRAMEWORK_V2_VLM_API_KEY', '')
                response = session.get(base + suffix, timeout=(3, 5))
                payload = response.json() if response.status_code == 200 else {}
                ready = (payload.get('ready') is True if name == 'asr' else
                         any(row.get('id') == os.getenv('FRAMEWORK_V2_VLM_MODEL', 'qwen3.5-4b')
                             for row in payload.get('data', [])))
                checks[name] = {'ok': response.status_code == 200 and ready,
                                'httpStatus': response.status_code}
        except Exception as error:
            checks[name] = {'ok': False, 'errorType': type(error).__name__}
    return {'ok': all(row['ok'] for row in checks.values()), 'checks': checks}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--peer', help='Tailscale peer IP, probed from this host')
    parser.add_argument('--peer-only', action='store_true', help='Host-side probe without DB/container dependencies')
    args = parser.parse_args(argv)
    if args.peer_only and not args.peer:
        parser.error('--peer-only requires --peer')
    result = {'ok': True, 'checks': {}} if args.peer_only else check()
    if args.peer:
        result['checks']['desktop_peer'] = peer_check(args.peer)
        result['ok'] = result['ok'] and result['checks']['desktop_peer']['ok']
    print(json.dumps(result))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
