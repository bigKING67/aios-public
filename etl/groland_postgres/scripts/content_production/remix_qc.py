"""Blocking QC of normalized remix outputs, bound to output bytes and snapshot."""
from dataclasses import asdict
import hashlib
import json
import time

from .execution import Cancelled, file_hash
from .workspace import WorkspaceLimit
from . import remix_similarity, remix_qc_media, remix_qc_sources

SCHEMA = "aios.remix-qc.v1"
FAILED = "remix_qc_failed"
INCOMPLETE = "remix_qc_incomplete"


class Rejected(RuntimeError):
    pass


def snapshot_hash(snapshot):
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def delivery_reason(snapshot, receipt):
    qc = receipt.get("host_remix_qc")
    if not isinstance(qc, dict) or qc.get("schema") != SCHEMA:
        return INCOMPLETE
    if (qc.get("snapshotSha256") != snapshot_hash(snapshot)
            or qc.get("outputSha256") != receipt.get("host_inspection", {}).get("sha256")):
        return INCOMPLETE
    if qc.get("status") == "failed":
        return FAILED
    checks = qc.get("checks", {})
    if (qc.get("status") != "passed" or not isinstance(checks, dict)
            or any(not isinstance(checks.get(key), dict) or checks[key].get("status") != "passed"
                   for key in ("timing", "freeze", "pictures", "sources"))):
        return INCOMPLETE
    return None


def review(snapshot, video, receipt, work, tick, resolve_source, check_sources, lock_fd=None):
    report = {"schema": SCHEMA, "status": "incomplete", "snapshotSha256": snapshot_hash(snapshot),
              "checks": {}, "limitations": ["sampled_picture_only", "lip_sync_unchecked",
              "speech_unchecked", "identity_unchecked", "human_review_required"]}
    stage = "binding"
    try:
        tick()
        settings = remix_qc_media.Settings.from_env()
        report["thresholds"] = asdict(settings)
        digest = file_hash(video)
        report["outputSha256"] = digest
        if (receipt["host_inspection"]["status"] != "passed" or receipt["host_inspection"]["sha256"] != digest
                or receipt["host_output_normalization"]["output"]["sha256"] != digest):
            raise ValueError("QC binding mismatch")
        spans, frames = remix_similarity.windows(snapshot, receipt)
        deadline = time.monotonic() + settings.timeout_seconds
        def qc_tick():
            tick()
            if time.monotonic() > deadline:
                raise TimeoutError("QC deadline")
        stage = "timing"
        report["checks"][stage] = remix_qc_media.timing(video, frames, settings, work, qc_tick, deadline, lock_fd)
        stage = "freeze"
        report["checks"][stage] = remix_qc_media.freeze_check(
            video, spans, frames, resolve_source, settings, work, qc_tick, deadline, lock_fd)
        stage = "pictures"
        pictures = remix_similarity.review(snapshot, video, receipt, work, qc_tick, lock_fd,
                                           settings.picture_max_distance, settings.picture_min_texture)
        receipt["host_remix_picture_review"] = pictures
        report["checks"][stage] = {"status": {"no_findings": "passed", "not_applicable": "passed",
            "review_required": "failed"}.get(pictures["status"], "incomplete"), "pairCount": pictures["pairCount"]}
        stage = "sources"
        report["checks"][stage] = check_sources()
        states = {check["status"] for check in report["checks"].values()}
        report["status"] = "failed" if "failed" in states else "incomplete" if "incomplete" in states else "passed"
    except (Cancelled, WorkspaceLimit):
        raise
    except Exception as error:
        report.update(errorStage=stage, errorType=type(error).__name__)
    return report
