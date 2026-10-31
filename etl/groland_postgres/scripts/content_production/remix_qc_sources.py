"""Recheck frozen human-confirmed segments under share locks at publication."""
from psycopg2.extras import RealDictCursor


def check(cursor, run_id, snapshot):
    cursor.execute("""SELECT br.segments,b.structure,b.constraints,b.preset_key,b.preset_version
      FROM ads.content_remix_batch_runs br JOIN ads.content_remix_batches b USING (batch_id)
      WHERE br.run_id=%s""", (run_id,))
    batch = cursor.fetchone()
    if not batch:
        return {"status": "incomplete", "reason": "missing_batch"}
    segments, clips = batch["segments"], snapshot["clips"]
    mode = batch["structure"].get("mode", "framework")
    labels = batch["structure"]["labels"]
    hashes = {str(a["assetId"]): a["sha256"] for a in snapshot["assets"]}
    if len(segments) != len(clips):
        return {"status": "failed", "reason": "clip_mapping_changed"}
    checks = []
    for index, (segment, clip) in enumerate(zip(segments, clips)):
        slot = segment.get("slot", index + 1) if mode == "sellingPoint" else index + 1
        if (type(slot) is not int or not 1 <= slot <= len(labels)
                or segment["labelKey"] != labels[slot - 1]
                or any(segment[key] != clip[key] for key in ("assetId", "startMs", "endMs"))
                or hashes.get(str(segment["assetId"])) != segment["sourceContentHash"]):
            return {"status": "failed", "reason": "slot_mapping_changed", "clipOrdinal": index + 1}
        frozen = segment.get("sourceChecks")
        if not frozen:
            # Older framework/edit batches froze enough information for a range
            # and label recheck. Old selling-point batches omitted their guards.
            if mode == "sellingPoint":
                return {"status": "incomplete", "reason": "missing_frozen_source_checks"}
            frozen = [{**segment, "presetKey": batch["preset_key"], "presetVersion": batch["preset_version"]}]
        checks.extend((index + 1, segment, part) for part in frozen)
    ids = sorted({part["segmentId"] for _, _, part in checks})
    cursor.execute("""SELECT s.segment_id,s.asset_id,s.source_content_hash,s.start_ms,s.end_ms,s.preset_key,s.preset_version,
        s.label_key,s.additional_label_keys,s.continues_previous,s.product_name,s.status,s.confirmed_by,s.confirmed_at,
        a.raw_sha256, (a.asset_status='ready' AND NOT a.is_deleted AND NOT a.external_only
          AND a.repurpose_allowed IS DISTINCT FROM FALSE AND a.authorization_status NOT IN ('restricted','expired')
          AND (a.authorization_starts_at IS NULL OR a.authorization_starts_at<=CURRENT_DATE)
          AND (a.authorization_expires_at IS NULL OR a.authorization_expires_at>=CURRENT_DATE)) AS source_available
        FROM ads.content_segments s JOIN ads.marketing_content_assets a USING(asset_id)
        WHERE s.segment_id=ANY(%s::UUID[]) ORDER BY s.segment_id FOR SHARE OF s,a""", (ids,))
    rows = {str(row["segment_id"]): row for row in cursor.fetchall()}
    for ordinal, segment, part in checks:
        row = rows.get(part["segmentId"])
        if row is None:
            return {"status": "failed", "reason": "segment_missing", "clipOrdinal": ordinal}
        same_bounds = row["start_ms"] == part["startMs"] and row["end_ms"] == part["endMs"]
        if mode == "edit":
            same_bounds = row["start_ms"] <= part["startMs"] < part["endMs"] <= row["end_ms"]
        labels_now = [row["label_key"], *row["additional_label_keys"]]
        valid = (str(row["asset_id"]) == segment["assetId"]
                 and row["source_content_hash"] == segment["sourceContentHash"]
                 and (row["raw_sha256"] or "").lower() == segment["sourceContentHash"] and row["source_available"]
                 and row["status"] == "confirmed" and row["confirmed_by"] and row["confirmed_at"]
                 and row["product_name"] == batch["constraints"]["productName"] and same_bounds
                 and row["preset_key"] == part["presetKey"] and row["preset_version"] == part["presetVersion"]
                 and part["labelKey"] in labels_now)
        if part["presetKey"] == "selling_point" and mode == "sellingPoint":
            valid = (valid and set(labels_now) == {part["labelKey"], *part["additionalLabelKeys"]}
                     and row["continues_previous"] == part["continuesPrevious"])
        if not valid:
            return {"status": "failed", "reason": "confirmed_segment_changed", "clipOrdinal": ordinal,
                    "segmentId": part["segmentId"]}
    return {"status": "passed", "checkedSegments": len(ids)}


def review(conn, run_id, snapshot):
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        result = check(cursor, run_id, snapshot)
    conn.commit()
    return result
