"""Independent semantic opening jobs and optional readings in the existing reports queue.

The API caches one active/successful job per category, window, input and prompt version. A worker
without write access skips this queue; source fingerprints and claim tokens fence result writes.
"""
import uuid

from psycopg2.extras import Json, RealDictCursor

from . import offline, opening_formulas, report_breakdown, snapshots

LEASE_SQL = "INTERVAL '10 minutes'"
REQUEST = {'max_output_tokens': 16000, 'thinking': {'type': 'enabled'}, 'temperature': 0.2, 'store': False}

_state = {'allowed': None}


class LeasedClient:
    """Renew between model calls; a multi-pass job must not outlive a single stale heartbeat.

    The normal Ark request timeout is 300s, below this queue's ten-minute lease. A lost claim
    stops before the next billable call, and finish/fail retain the existing claim-token fence.
    """
    def __init__(self, conn, job, client):
        self.conn, self.job, self.client = conn, job, client

    def _post(self, request):
        with self.conn.cursor() as cur:
            cur.execute("""UPDATE competitor.reports SET heartbeat_at=NOW()
              WHERE report_id=%s AND claim_token=%s AND status='running' RETURNING report_id""",
                        (self.job['report_id'], self.job['claim_token']))
            owned = cur.fetchone()
        self.conn.commit()
        if not owned:
            raise RuntimeError('report claim lost before model call')
        return self.client._post(request)


def allowed(conn):
    """True once the table exists and this role may update it; a missing table is checked again later."""
    if _state['allowed'] is not None:
        return _state['allowed']
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('competitor.reports') IS NOT NULL")
        if not cur.fetchone()[0]:
            conn.commit()
            return False
        cur.execute("SELECT has_table_privilege('competitor.reports', 'UPDATE')")
        _state['allowed'] = bool(cur.fetchone()[0])
    conn.commit()
    if not _state['allowed']:
        print('[competitor-reports] role cannot write reports; left to another worker', flush=True)
    return _state['allowed']


def claim(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f"""UPDATE competitor.reports SET status='failed', error_code='lease_expired',
          error_message='worker 已中断；模型调用可能已计费，可重新生成', finished_at=NOW()
          WHERE status='running' AND heartbeat_at < NOW() - {LEASE_SQL}""")
        cur.execute("""SELECT report_id FROM competitor.reports WHERE status='queued'
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1""")
        row = cur.fetchone()
        if not row:
            conn.commit()
            return None
        token = str(uuid.uuid4())
        cur.execute("""UPDATE competitor.reports SET status='running', claim_token=%s, heartbeat_at=NOW(),
          started_at=NOW(), attempt=attempt+1 WHERE report_id=%s
          RETURNING report_id::text, cohort, period, inputs, input_snapshot, prompt_version""", (token, row['report_id']))
        job = dict(cur.fetchone())
    conn.commit()
    job['claim_token'] = token
    return job


def finish(conn, job, inputs, result, issues, usage, cost_yuan):
    with conn.cursor() as cur:
        cur.execute("""UPDATE competitor.reports SET status='succeeded', model_id=%s, inputs=%s, report=%s,
          issues=%s, usage=%s, cost_yuan=%s, finished_at=NOW()
          WHERE report_id=%s AND claim_token=%s AND status='running' RETURNING report_id""",
                    (offline.MODEL, Json(inputs), Json(result), Json([list(i) for i in issues]), Json(usage),
                     cost_yuan, job['report_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    return bool(row)


def fail(conn, job, code, message, issues=(), usage=None, cost_yuan=None, result=None):
    with conn.cursor() as cur:
        cur.execute("""UPDATE competitor.reports SET status='failed', error_code=%s, error_message=%s,
          issues=%s, usage=COALESCE(%s, usage), cost_yuan=COALESCE(%s, cost_yuan), report=COALESCE(%s, report),
          model_id=COALESCE(%s, model_id), finished_at=NOW()
          WHERE report_id=%s AND claim_token=%s AND status='running' RETURNING report_id""",
                    (code, message[:500], Json([list(i) for i in issues]), Json(usage) if usage else None, cost_yuan,
                     Json(result) if result is not None else None, offline.MODEL if usage else None,
                     job['report_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    return bool(row)


def run(conn, job, client, today=None):
    """Independent semantic formulas or optional readings, fenced to the requested input and claim."""
    today = today or snapshots.business_today()
    openings_only = job['prompt_version'] == opening_formulas.PROMPT_VERSION
    if job['prompt_version'] not in (opening_formulas.PROMPT_VERSION, report_breakdown.PROMPT_VERSION):
        fail(conn, job, 'obsolete_prompt', '任务版本已更新，请重新生成')
        return 'failed'
    try:
        batch = report_breakdown.build_batch(snapshots.load_rows(conn), job['cohort'], job['period'], today,
                                             snapshots.load_compass(conn), min_films=1 if openings_only else report_breakdown.MIN_FILMS)
    except report_breakdown.InsufficientSample as error:
        fail(conn, job, 'insufficient_sample', f'样本不足：{error}')
        return 'failed'
    conn.commit()
    if batch['inputSnapshot'] != job['input_snapshot']:
        fail(conn, job, 'input_changed', '源数据已更新，等待新统计后重新生成')
        return 'failed'
    client = LeasedClient(conn, job, client)
    try:
        if openings_only:
            report, issues, spent = opening_formulas.generate(batch, client)
        else:
            with conn.cursor() as cur:
                cur.execute("""SELECT report FROM competitor.reports WHERE cohort=%s AND period=%s
                  AND input_snapshot=%s AND prompt_version=%s AND status='succeeded'
                  ORDER BY created_at DESC LIMIT 1""", (job['cohort'], job['period'], job['input_snapshot'], opening_formulas.PROMPT_VERSION))
                cached = cur.fetchone()
            conn.commit()
            report, issues, spent = report_breakdown.generate(batch, client, cached_formulas=cached[0] if cached else None)
    except report_breakdown.ReportFailed as error:
        fail(conn, job, error.code, error.message, issues=error.issues, usage=error.spent['usage'],
             cost_yuan=error.spent['cost_yuan'], result=error.result)
        return 'failed'
    inputs = report_breakdown.inputs_record(batch)
    inputs['promptVersion'] = job['prompt_version']
    return 'succeeded' if finish(conn, job, inputs, report, issues, spent['usage'], spent['cost_yuan']) else 'lost'


def process_one(conn, client_factory):
    """Runs at most one queued report; None when there is nothing to do or this role may not."""
    if not allowed(conn):
        return None
    job = claim(conn)
    if job is None:
        return None
    try:
        status = run(conn, job, client_factory())
    except Exception as error:  # noqa: BLE001 - the row must leave running with a reason
        conn.rollback()
        fail(conn, job, 'worker_error', f'{type(error).__name__}: {str(error)[:300]}')
        status = 'failed'
    print(f"[competitor-reports] {job['report_id']} {job['cohort']}/{job['period']} -> {status}", flush=True)
    return status
