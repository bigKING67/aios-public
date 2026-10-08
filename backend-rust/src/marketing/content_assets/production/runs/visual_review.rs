//! Read-only observations for the exact current render; never a delivery grant.
use super::types::Run;
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const KINDS: [&str; 6] = [
    "residual_text",
    "subject_integrity",
    "temporal_artifacts",
    "caption_readability",
    "caption_style",
    "visual_alignment",
];
fn invalid() -> AppError {
    AppError::Conflict("画面复检与当前工程或成片不一致，请重新读取".into())
}
pub(super) fn digest(value: &Value) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(value).expect("JSON serializes"))
    )
}
pub(super) fn sha(value: &Value) -> bool {
    value.as_str().is_some_and(|s| {
        s.len() == 64
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}

pub(super) fn inspect(run: &Run, job: Uuid, receipt: &Value, snapshot: &Value) -> AppResult<Value> {
    let review = &receipt["host_visual_review"];
    let identity = &review["identity"];
    let document_sha = digest(&snapshot["editDocument"]);
    let expected = json!({"runId":run.run_id,"jobId":job,"projectId":run.project_id,
        "projectRevision":run.project_revision,"executionVersion":run.execution_version,
        "planRevision":run.plan_revision,"documentSha256":document_sha,
        "videoSha256":receipt["output"]["sha256"]});
    let model = review["model"].as_str().ok_or_else(invalid)?;
    let limit = review["callLimit"].as_u64().ok_or_else(invalid)?;
    let reserved = receipt["host_visual_calls"].as_object();
    let calls = reserved.map_or(0, |v| v.len());
    let derived = snapshot["derivedAssets"].as_array().ok_or_else(invalid)?;
    let entries = review["entries"].as_array().ok_or_else(invalid)?;
    if review["schema"] != "aios.treatment-visual-worker.v1"
        || ![
            "source-treatment-visual-review-v1",
            "source-treatment-visual-review-v2-caption-detail",
        ]
        .iter()
        .any(|v| review["promptVersion"] == *v)
        || review["samplingFps"] != 2
        || review["deliveryApproved"] != false
        || model.trim().is_empty()
        || model.chars().count() > 128
        || !(1..=3).contains(&limit)
        || calls as u64 > limit
        || (receipt.get("host_visual_calls").is_some() && reserved.is_none())
        || review["callsReserved"].as_u64() != Some(calls as u64)
        || identity != &expected
        || !sha(&identity["videoSha256"])
        || receipt["host_run_id"] != expected["runId"]
        || receipt["host_project_id"] != expected["projectId"]
        || receipt["host_revision"] != expected["projectRevision"]
        || receipt["host_execution_version"] != expected["executionVersion"]
        || receipt["host_plan_revision"] != expected["planRevision"]
        || receipt["edit_document"]["sha256"] != document_sha
        || receipt["host_inspection"]["schema"] != "aios.media-inspection.v1"
        || receipt["host_inspection"]["status"] != "passed"
        || receipt["host_inspection"]["sha256"] != identity["videoSha256"]
        || !super::super::render_binding::receipt_matches(
            run.sources.render_binding.as_ref(),
            receipt,
        )
        || derived.is_empty()
        || derived.len() > 30
        || entries.len() != derived.len()
        || ["exactFontIdentity", "fullTemporalQuality", "productFacts"]
            .iter()
            .any(|k| review[k] != "unverified")
    {
        return Err(invalid());
    }
    let mut output = Vec::with_capacity(entries.len());
    let mut observed_calls = 0;
    let mut complete = true;
    for (entry, asset) in entries.iter().zip(derived) {
        let request = &asset["treatmentRequest"];
        let request_sha = digest(request);
        if asset["requestSha256"] != request_sha
            || entry["requestSha256"] != request_sha
            || entry["assetVersionId"] != asset["assetVersionId"]
            || entry["outputSha256"] != asset["sha256"]
            || !sha(&entry["outputSha256"])
            || entry["timeline"] != request["timeline"]
            || entry["frames"] != request["frames"]
        {
            return Err(invalid());
        }
        let caption_evidence = if review["promptVersion"]
            == "source-treatment-visual-review-v2-caption-detail"
            && entry.get("captionEvidence").is_some()
        {
            Some(super::visual_caption_evidence::inspect(
                entry,
                request,
                &snapshot["editDocument"],
            )?)
        } else {
            None
        };
        let was_reserved = reserved.and_then(|r| r.get(&request_sha));
        if let Some(value) = was_reserved {
            if review["promptVersion"] == "source-treatment-visual-review-v2-caption-detail"
                && caption_evidence.is_none()
            {
                return Err(invalid());
            }
            observed_calls += 1;
            if value != "reserved_outcome_unknown"
                || !sha(&entry["comparisonSha256"])
                || !sha(&entry["inputSha256"])
            {
                return Err(invalid());
            }
        }
        let mut item = json!({"assetVersionId":entry["assetVersionId"],"requestSha256":request_sha,
            "timeline":entry["timeline"],"frames":entry["frames"],"status":entry["status"]});
        if let Some(evidence) = caption_evidence {
            item["captionEvidence"] = evidence;
        }
        match entry["status"].as_str() {
            Some("issues_found" | "inconclusive" | "no_issues_reported") => {
                let frames = request["frames"]
                    .as_u64()
                    .filter(|n| (1..=300).contains(n))
                    .ok_or_else(invalid)?;
                let (status, actions) = findings(
                    &entry["checks"],
                    frames,
                    review["promptVersion"] == "source-treatment-visual-review-v1",
                )?;
                if was_reserved.is_none()
                    || entry["status"] != status
                    || entry["nextActions"] != json!(actions)
                    || entry["responseSha256"] != digest(&json!({"checks":entry["checks"]}))
                {
                    return Err(invalid());
                }
                item["checks"] = entry["checks"].clone();
                item["nextActions"] = json!(actions);
                item["comparisonSha256"] = entry["comparisonSha256"].clone();
            }
            Some("incomplete" | "reserved" | "not_reviewed") => {
                if entry.get("checks").is_some()
                    || (entry["status"] == "not_reviewed" && was_reserved.is_some())
                {
                    return Err(invalid());
                }
                complete = false;
                item["nextActions"] = json!(["inspect_uncertainty"]);
                if let Some(stage) = entry.get("errorStage") {
                    if ![
                        "configuration",
                        "prepare_source",
                        "comparison",
                        "caption_detail",
                        "reservation",
                        "provider",
                        "response_validation",
                    ]
                    .iter()
                    .any(|s| stage == s)
                    {
                        return Err(invalid());
                    }
                    item["failureStage"] = stage.clone();
                }
            }
            _ => return Err(invalid()),
        }
        output.push(item);
    }
    if calls != observed_calls
        || review["status"] != if complete { "reviewed" } else { "incomplete" }
    {
        return Err(invalid());
    }
    Ok(
        json!({"scope":"treated_picture_observations","identity":identity,"model":model,
        "status":review["status"],"samplingFps":2,"callLimit":limit,"callsReserved":calls,
        "entries":output,"deliveryApproved":false,"exactFontIdentity":"unverified",
        "fullTemporalQuality":"unverified","productFacts":"unverified"}),
    )
}

fn findings(
    checks: &Value,
    frames: u64,
    legacy: bool,
) -> AppResult<(&'static str, Vec<&'static str>)> {
    let checks = checks
        .as_array()
        .filter(|v| v.len() == 6)
        .ok_or_else(invalid)?;
    let mut seen = std::collections::HashSet::new();
    let mut issues = Vec::new();
    let mut uncertain = false;
    for check in checks {
        let keys = check.as_object().ok_or_else(invalid)?;
        let kind = check["kind"].as_str().ok_or_else(invalid)?;
        let start = check["startFrame"].as_u64().ok_or_else(invalid)?;
        let end = check["endFrame"].as_u64().ok_or_else(invalid)?;
        let text = check["observation"].as_str().ok_or_else(invalid)?;
        if keys.len() != 5
            || !KINDS.contains(&kind)
            || !seen.insert(kind)
            || start >= end
            || end > frames
            || text.trim().is_empty()
            || text.chars().count() > 500
            || text.chars().any(|c| c < ' ')
        {
            return Err(invalid());
        }
        match check["verdict"].as_str() {
            Some("issue_observed") => issues.push(kind),
            Some("uncertain") => uncertain = true,
            Some("no_issue_observed") => (),
            _ => return Err(invalid()),
        }
    }
    let mut actions = Vec::new();
    if issues.iter().any(|k| KINDS[..3].contains(k)) {
        actions.push("repair_or_replace_picture");
    }
    if issues
        .iter()
        .any(|k| ["caption_readability", "caption_style"].contains(k))
    {
        actions.push("revise_subtitles");
    }
    if issues.contains(&"visual_alignment") {
        actions.push(if legacy {
            "reselect_picture"
        } else {
            "inspect_alignment"
        });
    }
    if uncertain {
        actions.push("inspect_uncertainty");
    }
    if actions.is_empty() {
        actions.push("await_product_quality_evidence");
    }
    Ok((
        if !issues.is_empty() {
            "issues_found"
        } else if uncertain {
            "inconclusive"
        } else {
            "no_issues_reported"
        },
        actions,
    ))
}
