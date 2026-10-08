"""Run orchestration references existing immutable render jobs; no second queue."""
import os
from psycopg2.extras import RealDictCursor
from .output_profile import canvas, profile_name
from .caption_quality import caption_delivery_reason
from .render_binding import receipt_matches
from . import remix_output


def matches_output_profile(snapshot: dict, inspection: dict) -> bool:
    try:
        name = profile_name(snapshot)
        return (inspection.get("outputProfile", "legacy_v1") == name
                and all(inspection.get(key) == value for key, value in canvas(snapshot).items()))
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


def enabled() -> bool:
    return os.getenv("CONTENT_PRODUCTION_RUNS_ENABLED") == "true"


def linkage(conn, job: dict) -> dict | None:
    if not enabled():
        return None
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("""SELECT l.run_id,l.execution_version,l.plan_revision,r.request->>'taskType' AS task_type
          FROM ads.content_production_run_renders l JOIN ads.content_production_runs r ON r.run_id=l.run_id
          WHERE l.job_id=%s""", (job["job_id"],))
        row = cursor.fetchone()
    conn.commit()
    return dict(row) if row else None


def reconcile(conn) -> int:
    if not enabled():
        return 0
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        # Terminal jobs are immutable. Lock only Run; never reverse API's Run -> job order.
        cursor.execute("""SELECT r.run_id,r.status,r.pause_requested,r.execution_version,
            r.plan_revision,r.project_id,r.project_revision,j.status AS job_status,j.receipt,
            j.output_object_key,j.project_id AS job_project,j.revision AS job_revision,
            l.execution_version AS render_execution,l.plan_revision AS render_plan,
            v.snapshot,j.preview,j.finished_at < NOW() - INTERVAL '1 hour' AS job_stale
          FROM ads.content_production_runs r
          JOIN ads.content_production_run_renders l ON l.job_id=r.render_job_id AND l.run_id=r.run_id
          JOIN ads.content_production_jobs j ON j.job_id=l.job_id
          JOIN ads.content_production_revisions v ON v.project_id=j.project_id AND v.revision=j.revision
          WHERE r.render_job_id IS NOT NULL AND r.status IN ('running','cancelling')
            AND j.status IN ('completed','failed','cancelled')
          ORDER BY r.updated_at LIMIT 50 FOR UPDATE OF r SKIP LOCKED""")
        rows = cursor.fetchall()
        remix = bool(rows) and remix_output.installed(cursor)
        for row in rows:
            status, stage, reason = "waiting", "production", "render_failed"
            if row["status"] == "cancelling":
                status, reason = "cancelled", None
            elif row["pause_requested"]:
                status, reason = "paused", "render_paused"
            elif row["execution_version"] != row["render_execution"] or row["plan_revision"] != row["render_plan"]:
                reason = "render_superseded"
            elif row["job_status"] == "completed":
                receipt = row["receipt"] if isinstance(row["receipt"], dict) else {}
                inspection = receipt.get("host_inspection", {})
                inspection = inspection if isinstance(inspection, dict) else {}
                valid = (
                    row["output_object_key"] and row["project_id"] == row["job_project"]
                    and row["project_revision"] == row["job_revision"]
                    and receipt.get("host_project_id") == str(row["project_id"])
                    and receipt.get("host_revision") == row["project_revision"]
                    and receipt.get("host_run_id") == str(row["run_id"])
                    and receipt.get("host_execution_version") == row["execution_version"]
                    and receipt.get("host_plan_revision") == row["plan_revision"]
                    and inspection.get("schema") == "aios.media-inspection.v1"
                    and inspection.get("status") == "passed"
                    and not row["preview"]
                    and matches_output_profile(row["snapshot"], inspection)
                    and receipt_matches(row["snapshot"], receipt)
                )
                if valid:
                    reason = caption_delivery_reason(row["snapshot"], receipt)
                    if reason is None and remix:
                        # Framework remix outputs are registered with lineage in this same transaction.
                        reason = remix_output.publish(cursor, row["run_id"], row["snapshot"], receipt,
                                                      row["output_object_key"])
                        if reason == remix_output.RETRY:
                            if not row["job_stale"]:
                                continue  # stays running; retried on the next pass
                            reason = remix_output.FAILED
                    if reason is None:
                        status, stage = "succeeded", "delivery"
                    else:
                        stage = "inspection"
                else:
                    reason = "invalid_render_receipt"
            elif row["job_status"] == "cancelled":
                reason = "render_cancelled"
            cursor.execute("""UPDATE ads.content_production_runs SET status=%s,stage=%s,
              waiting_reason=%s,pause_requested=FALSE,version=version+1,updated_at=NOW()
              WHERE run_id=%s""", (status, stage, reason, row["run_id"]))
        if remix:
            remix_output.refresh_batches(cursor, [row["run_id"] for row in rows])
    conn.commit()
    return len(rows)
