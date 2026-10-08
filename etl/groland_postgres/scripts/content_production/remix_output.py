"""框架混剪成片回写: the single writer of output assets and segment lineage.

Called by run_bridge.reconcile inside its Run-locked transaction, only for a
Run whose render receipt already passed the technical checks. The output is
registered as a new library asset (source_type='ai_studio_output') owned by
the batch owner, with its raw object and one lineage row per segment. The
batch Run row is locked and `output_asset_id` makes publication idempotent.
The batch `status` column is a summary refreshed on every reconciliation (and
by the API's batch cancel) with the same rule; the API derives the live status
from the Runs.
"""
import json
import logging
import uuid

import psycopg2
from psycopg2 import errors as pg_errors

LOG = logging.getLogger(__name__)
TITLE_PRODUCT_CHARS = 40
MISMATCH = "remix_lineage_mismatch"
FAILED = "remix_output_failed"
# Not a waiting reason: a transient database error (lock timeout, deadlock, cancel,
# lost connection) leaves the Run running so the next reconciliation retries the
# publication instead of discarding a billed render.
RETRY = "remix_output_retry"
ENTERPRISE_TAG_PREFIX = "企业:"
OUTPUT_EVENT_MESSAGES = {"framework": "框架混剪成片已回存素材库", "edit": "单条剪辑成片已回存素材库"}


def installed(cursor) -> bool:
    """Workers may be deployed before migration 031; never break reconciliation."""
    cursor.execute("SELECT to_regclass('ads.content_remix_batch_runs') IS NOT NULL AS installed")
    row = cursor.fetchone()
    return bool(row["installed"] if isinstance(row, dict) else row[0])


def _clips_match(segments: list, clips: list) -> bool:
    return len(segments) == len(clips) and all(
        str(s.get("assetId")) == str(c.get("assetId"))
        and s.get("startMs") == c.get("startMs") and s.get("endMs") == c.get("endMs")
        for s, c in zip(segments, clips))


def output_title(mode, product: str, batch: uuid.UUID, ordinal: int) -> str:
    """单条剪辑 batches (structure.mode = 'edit') hold one output; 框架混剪 numbers each output."""
    if mode == "edit":
        return f"单条剪辑 · {product[:TITLE_PRODUCT_CHARS]} · {batch.hex[:8]}"
    return f"框架混剪 · {product[:TITLE_PRODUCT_CHARS]} · {batch.hex[:8]}-{ordinal:02d}"


def publish(cursor, run_id, snapshot: dict, receipt: dict, output_key: str) -> str | None:
    """Returns None when published/already published/not a remix Run, else a waiting reason."""
    cursor.execute("""SELECT br.batch_id,br.ordinal,br.segments,br.output_asset_id,b.owner_user_id,
        b.constraints->>'productName' AS product,b.structure->>'mode' AS mode
      FROM ads.content_remix_batch_runs br JOIN ads.content_remix_batches b USING (batch_id)
      WHERE br.run_id=%s FOR UPDATE OF br""", (run_id,))
    link = cursor.fetchone()
    if not link or link["output_asset_id"]:
        return None
    segments = link["segments"] if isinstance(link["segments"], list) else []
    clips = snapshot.get("clips") if isinstance(snapshot, dict) else None
    if not segments or not isinstance(clips, list) or not _clips_match(segments, clips):
        return MISMATCH
    inspection = receipt.get("host_inspection") or {}
    sha = str(inspection.get("sha256") or "").lower()
    if len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
        return MISMATCH
    cursor.execute("SELECT bucket FROM ads.marketing_content_assets WHERE asset_id=%s",
                   (segments[0]["assetId"],))
    source = cursor.fetchone()
    if not source:
        return MISMATCH
    product = link["product"] or ""
    batch = uuid.UUID(str(link["batch_id"]))
    title = output_title(link.get("mode"), product, batch, link["ordinal"])
    provenance = {"source": "ai_studio_output", "runId": str(run_id), "batchId": str(batch),
                  "ordinal": link["ordinal"], "mode": "edit" if link.get("mode") == "edit" else "framework"}
    cursor.execute("SAVEPOINT remix_output")
    try:
        _register(cursor, run_id, link, segments, source["bucket"], output_key, sha, inspection, provenance, title)
    except pg_errors.UniqueViolation:
        # The same rendered bytes are already an active library asset: register no second
        # asset, but link that asset as this Run's output so its lineage stays traceable.
        cursor.execute("ROLLBACK TO SAVEPOINT remix_output")
        LOG.warning("remix output of run %s duplicates an existing raw_sha256; linking that asset", run_id)
        return _link_existing(cursor, run_id, segments, sha)
    except psycopg2.OperationalError:
        cursor.execute("ROLLBACK TO SAVEPOINT remix_output")
        LOG.warning("remix output registration of run %s hit a transient database error; retrying later", run_id)
        return RETRY
    except psycopg2.Error:
        # Never let one output abort reconciliation of every other Run; keep it unpublished.
        cursor.execute("ROLLBACK TO SAVEPOINT remix_output")
        LOG.exception("remix output registration failed for run %s", run_id)
        return FAILED
    cursor.execute("RELEASE SAVEPOINT remix_output")
    return None


def _link_existing(cursor, run_id, segments, sha) -> str | None:
    cursor.execute("""SELECT asset_id FROM ads.marketing_content_assets
      WHERE raw_sha256=%s AND is_deleted=FALSE""", (sha,))
    existing = cursor.fetchone()
    if not existing:
        return FAILED
    try:
        _write_lineage(cursor, run_id, str(existing["asset_id"]), segments)
    except psycopg2.Error:
        cursor.execute("ROLLBACK TO SAVEPOINT remix_output")
        LOG.exception("remix output lineage failed for run %s", run_id)
        return FAILED
    cursor.execute("RELEASE SAVEPOINT remix_output")
    return None


def _write_lineage(cursor, run_id, asset_id, segments) -> None:
    for ordinal, segment in enumerate(segments, start=1):
        cursor.execute("""INSERT INTO ads.content_asset_lineage (output_asset_id,run_id,ordinal,segment_id,
            source_asset_id,source_content_hash,source_start_ms,source_end_ms) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                       (asset_id, run_id, ordinal, segment["segmentId"], segment["assetId"],
                        segment["sourceContentHash"], segment["startMs"], segment["endMs"]))
    cursor.execute("UPDATE ads.content_remix_batch_runs SET output_asset_id=%s WHERE run_id=%s", (asset_id, run_id))


def _enterprise_tags(cursor, segments) -> list:
    """`企业:<name>` tags of the source originals, so an output stays in its enterprise's studio scope."""
    source_ids = sorted({str(segment["assetId"]) for segment in segments})
    cursor.execute("""SELECT DISTINCT tag FROM ads.marketing_content_assets, UNNEST(tags) AS tag
      WHERE asset_id = ANY(%s::UUID[]) AND tag LIKE %s ORDER BY tag""", (source_ids, ENTERPRISE_TAG_PREFIX + "%"))
    return [row["tag"] for row in cursor.fetchall()]


def _register(cursor, run_id, link, segments, bucket, output_key, sha, inspection, provenance, title) -> None:
    product = link["product"] or ""
    asset_id = str(uuid.uuid4())
    owner = link["owner_user_id"]
    width, height, duration = inspection.get("width"), inspection.get("height"), inspection.get("durationSeconds")
    tags = _enterprise_tags(cursor, segments)
    cursor.execute("""INSERT INTO ads.marketing_content_assets (asset_id,title,asset_type,asset_status,
        profile_status,lifecycle_status,source_type,external_only,bucket,raw_object_key,raw_sha256,
        file_ext,mime_type,duration_seconds,width,height,product_name,product_names,owner_user_id,
        uploaded_by_user_id,uploaded_at,tags)
      VALUES (%s,%s,'video','ready','incomplete','draft','ai_studio_output',FALSE,%s,%s,%s,'mp4','video/mp4',
        %s,%s,%s,%s,%s,%s,%s,NOW(),%s)""",
                   (asset_id, title, bucket, output_key, sha, duration, width, height, product or None,
                    [product] if product else [], owner, owner, tags))
    cursor.execute("""INSERT INTO ads.marketing_content_asset_objects (object_id,asset_id,object_role,
        storage_provider,bucket,object_key,content_type,file_ext,sha256,width,height,duration_seconds,status,metadata)
      VALUES (%s,%s,'raw','tos',%s,%s,'video/mp4','mp4',%s,%s,%s,%s,'active',%s)""",
                   (str(uuid.uuid4()), asset_id, bucket, output_key, sha, width, height, duration,
                    json.dumps(provenance)))
    cursor.execute("""INSERT INTO ads.marketing_content_asset_events (asset_id,event_type,actor,message,payload)
      VALUES (%s,'ai_studio_output_created',%s,%s,%s)""",
                   (asset_id, owner, OUTPUT_EVENT_MESSAGES[provenance["mode"]], json.dumps(provenance)))
    _queue_derivatives(cursor, asset_id, output_key)
    _write_lineage(cursor, run_id, asset_id, segments)


def derivative_key(raw_object_key: str, folder: str, file_ext: str) -> str:
    """Same layout as the API backfill (`processing_mutations::object_keys::derive_output_key`)."""
    directory, _, file_name = raw_object_key.rpartition("/")
    stem = file_name.rsplit(".", 1)[0] if "." in file_name else file_name
    relative = directory[len("raw/"):] if directory.startswith("raw/") else directory
    return f"{folder}/{relative}/{stem}.{file_ext}" if relative else f"{folder}/{stem}.{file_ext}"


def _queue_derivatives(cursor, asset_id, output_key) -> None:
    """Queue the library preview/cover jobs an upload would get, so outputs show
    a cover like any other asset. Idempotent per (asset, job type)."""
    for job_type, file_ext in (("preview", "mp4"), ("cover", "webp")):
        cursor.execute("""INSERT INTO ads.marketing_content_asset_processing_jobs
            (job_id,asset_id,job_type,status,input_object_key,output_object_key,metadata)
          SELECT %s,%s,%s,'queued',%s,%s,%s
          WHERE NOT EXISTS (SELECT 1 FROM ads.marketing_content_asset_processing_jobs
            WHERE asset_id=%s AND job_type=%s AND status<>'cancelled')""",
                       (str(uuid.uuid4()), asset_id, job_type, output_key,
                        derivative_key(output_key, job_type, file_ext),
                        json.dumps({"created_by": "ai_studio_output"}), asset_id, job_type))


def cancelled_supported(cursor) -> bool:
    """Migration 032 widens the stored summary with 'cancelled'; before it,
    cancelled Runs keep the 031 vocabulary (counted as not succeeded)."""
    cursor.execute("""SELECT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid='ads.content_remix_batches'::regclass AND conname='content_remix_batches_status_check'
          AND pg_get_constraintdef(oid) LIKE '%''cancelled''%') AS supported""")
    row = cursor.fetchone()
    return bool(row["supported"] if isinstance(row, dict) else row[0])


def refresh_batches(cursor, run_ids: list) -> None:
    """Same rule as the API (`remix_read::batch_status`): any queued/running/
    cancelling/paused Run keeps the batch running; once all settled, all
    succeeded → succeeded, any cancelled → cancelled, none succeeded → failed,
    otherwise partially_failed.

    Called once after all Runs of a reconciliation were updated; batch rows are
    locked in batch_id order so concurrent reconcilers never deadlock on them.
    """
    if not run_ids:
        return
    ids = [str(run_id) for run_id in run_ids]
    cursor.execute("""SELECT batch_id FROM ads.content_remix_batches WHERE batch_id IN (
        SELECT batch_id FROM ads.content_remix_batch_runs WHERE run_id=ANY(%s::UUID[]))
      ORDER BY batch_id FOR UPDATE""", (ids,))
    batches = [row["batch_id"] if isinstance(row, dict) else row[0] for row in cursor.fetchall()]
    if not batches:
        return
    cancelled = cancelled_supported(cursor)
    cursor.execute("""UPDATE ads.content_remix_batches b SET status=s.status,updated_at=NOW()
      FROM (SELECT br.batch_id, CASE
          WHEN COUNT(*) FILTER (WHERE r.status IN ('queued','running','cancelling','paused'))>0 THEN 'running'
          WHEN COUNT(*) FILTER (WHERE r.status='succeeded')=COUNT(*) THEN 'succeeded'
          WHEN %s AND COUNT(*) FILTER (WHERE r.status='cancelled')>0 THEN 'cancelled'
          WHEN COUNT(*) FILTER (WHERE r.status='succeeded')=0 THEN 'failed'
          ELSE 'partially_failed' END AS status
        FROM ads.content_remix_batch_runs br JOIN ads.content_production_runs r ON r.run_id=br.run_id
        WHERE br.batch_id=ANY(%s::UUID[])
        GROUP BY br.batch_id) s
      WHERE b.batch_id=s.batch_id AND b.status<>s.status""", (cancelled, [str(b) for b in batches]))
