//! Current-render revision proposals are observations, never execution or approval.
use super::{
    types::Run,
    visual_review::{digest, sha},
};
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};
use uuid::Uuid;

fn invalid() -> AppError {
    AppError::Conflict("选段复核建议与当前工程或证据不一致，请重新读取".into())
}

pub(super) fn inspect(run: &Run, job: Uuid, receipt: &Value, snapshot: &Value) -> AppResult<Value> {
    let review = &receipt["host_selected_semantic_review"];
    let follow = &review["followUp"];
    let document = &snapshot["editDocument"];
    let document_sha = digest(document);
    let video = &receipt["output"]["sha256"];
    let binding =
        json!({"runId":run.run_id,"jobId":job,"documentSha256":document_sha,"outputSha256":video});
    let empty_ledger = serde_json::Map::new();
    let ledger = match receipt.get("host_visual_calls") {
        Some(value) => value.as_object().ok_or_else(invalid)?,
        None => &empty_ledger,
    };
    let limit = review["callLimit"].as_u64().ok_or_else(invalid)?;
    if review["schema"] != "aios.selected-semantic-review.v2"
        || review["samplingFps"] != 5
        || review["model"]
            .as_str()
            .is_none_or(|s| s.trim().is_empty() || s.chars().count() > 128)
        || review["runId"] != binding["runId"]
        || review["jobId"] != binding["jobId"]
        || review["documentSha256"] != document_sha
        || review["outputSha256"] != *video
        || review["deliveryApproved"] != false
        || follow["deliveryApproved"] != false
        || follow["schema"] != "aios.selected-review-follow-up.v1"
        || follow["binding"] != binding
        || follow["execution"] != "not_started"
        || !sha(video)
        || receipt["host_run_id"] != binding["runId"]
        || receipt["host_project_id"] != json!(run.project_id)
        || receipt["host_revision"] != json!(run.project_revision)
        || receipt["host_execution_version"] != run.execution_version
        || receipt["host_plan_revision"] != run.plan_revision
        || receipt["edit_document"]["sha256"] != document_sha
        || receipt["host_inspection"]["sha256"] != *video
        || receipt["host_inspection"]["status"] != "passed"
        || receipt["host_inspection"]["schema"] != "aios.media-inspection.v1"
        || !super::super::render_binding::receipt_matches(
            run.sources.render_binding.as_ref(),
            receipt,
        )
        || !(1..=3).contains(&limit)
        || ledger.len() as u64 > limit
        || review["callsReserved"].as_u64() != Some(ledger.len() as u64)
        || ledger.values().any(|v| v != "reserved_outcome_unknown")
        || follow["constraints"]
            != json!({"preserveOriginalSubtitles":true,"preserveOriginalAudio":true,
            "automaticErasureAllowed":false,"automaticCaptionRewriteAllowed":false})
    {
        return Err(invalid());
    }
    let entries = review["entries"].as_array().ok_or_else(invalid)?;
    let proposals = follow["proposals"].as_array().ok_or_else(invalid)?;
    if entries.len() > 300 || proposals.len() > entries.len() * 3 {
        return Err(invalid());
    }
    for entry in entries {
        validate_window(entry, document)?;
        for stage in [entry, &entry["textReview"]] {
            if stage.get("responseSha256").is_some()
                && (!sha(&stage["inputSha256"])
                    || ledger
                        .get(stage["inputSha256"].as_str().ok_or_else(invalid)?)
                        .is_none())
            {
                return Err(invalid());
            }
            if let Some(request) = stage.get("inputSha256") {
                // A failed reservation can retain an input digest without having called a model.
                if !sha(request) {
                    return Err(invalid());
                }
                if stage.get("responseSha256").is_some()
                    && (ledger.get(request.as_str().ok_or_else(invalid)?).is_none()
                        || !sha(&stage["responseSha256"]))
                {
                    return Err(invalid());
                }
            }
        }
        if entry.get("checks").is_some()
            && entry["responseSha256"]
                != digest(&json!({"checks":entry["checks"],"visibleText":entry["visibleText"]}))
        {
            return Err(invalid());
        }
        if entry["textReview"]["status"] == "reviewed"
            && (entry["textReview"]["responseSha256"]
                != digest(&json!({"checks":entry["textReview"]["checks"]}))
                || entry["textReview"]["observationSha256"] != digest(&entry["visibleText"]))
        {
            return Err(invalid());
        }
    }
    for proposal in proposals {
        validate_proposal(proposal, review, entries)?;
    }
    for entry in entries {
        for category in ["picture_narration", "visible_artifacts", "visible_text"] {
            let verdict = if category == "visible_text" {
                if entry["textReview"]["status"] == "reviewed" {
                    entry["textReview"]["checks"][0]["relation"].as_str()
                } else {
                    None
                }
            } else {
                entry["checks"]
                    .as_array()
                    .and_then(|checks| checks.iter().find(|c| c["kind"] == category))
                    .and_then(|c| c["verdict"].as_str())
            };
            let expected = match verdict {
                Some("compatible" | "no_issue_observed") => None,
                Some("conflict" | "issue_observed") => Some(if category == "visible_artifacts" {
                    "compare_source_and_render"
                } else {
                    "reselect_source"
                }),
                Some("uncertain") | None => Some("collect_evidence"),
                _ => return Err(invalid()),
            };
            let matching: Vec<_> = proposals
                .iter()
                .filter(|p| {
                    p["category"] == category
                        && p["target"]["clipId"] == entry["clipId"]
                        && p["target"]["startFrame"] == entry["window"]["startFrame"]
                        && p["target"]["endFrame"] == entry["window"]["endFrame"]
                })
                .collect();
            if matching.len() != usize::from(expected.is_some())
                || expected
                    .is_some_and(|action| matching.first().is_none_or(|p| p["action"] != action))
            {
                return Err(invalid());
            }
        }
    }
    let revision = proposals.iter().any(|p| p["action"] != "collect_evidence");
    let status = if revision {
        "revision_proposed"
    } else if proposals.is_empty() && !entries.is_empty() {
        "observations_only"
    } else {
        "evidence_required"
    };
    if follow["status"] != status {
        return Err(invalid());
    }
    // Derived only after receipt, current render and per-window checks validate.
    // It summarizes sampled evidence; it cannot change Run delivery eligibility.
    let passed_windows = entries
        .iter()
        .filter(|entry| {
            !proposals.iter().any(|p| {
                p["target"]["clipId"] == entry["clipId"]
                    && p["target"]["startFrame"] == entry["window"]["startFrame"]
                    && p["target"]["endFrame"] == entry["window"]["endFrame"]
            })
        })
        .count();
    let summary = json!({"schema":"aios.selected-review-summary.v1",
        "status":match status {"observations_only"=>"sampled_checks_passed","revision_proposed"=>"needs_revision",_=>"evidence_required"},
        "scope":"selected_output_windows_sampled", "windowCount":entries.len(),
        "passedWindowCount":passed_windows,"binding":binding,
        "unverified":["full_video_quality","audio_visual_sync","listening","product_identity","publication_authorization"],
        "deliveryApproved":false});
    Ok(
        json!({"schema":review["schema"],"model":review["model"],"promptVersion":review["promptVersion"],
        "entries":entries,"followUp":follow,"summary":summary,"deliveryApproved":false}),
    )
}

fn validate_window(entry: &Value, document: &Value) -> AppResult<()> {
    let window = &entry["window"];
    if entry["clipId"] != window["clipId"] {
        return Err(invalid());
    }
    let clip = document["clips"]
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .find(|c| c["id"] == window["clipId"])
        .ok_or_else(invalid)?;
    let asset = document["assets"]
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .find(|a| a["ref"] == clip["assetRef"])
        .ok_or_else(invalid)?;
    let lo = window["startFrame"].as_u64().ok_or_else(invalid)?;
    let hi = window["endFrame"].as_u64().ok_or_else(invalid)?;
    if lo >= hi
        || lo
            < clip["timeline"]["startFrame"]
                .as_u64()
                .ok_or_else(invalid)?
        || hi > clip["timeline"]["endFrame"].as_u64().ok_or_else(invalid)?
        || window["assetVersionId"] != asset["assetVersionId"]
        || window["sha256"] != asset["sha256"]
    {
        return Err(invalid());
    }
    let maps = clip["sourceMap"].as_array().ok_or_else(invalid)?;
    let start = clip["timeline"]["startFrame"]
        .as_u64()
        .ok_or_else(invalid)?;
    if maps.len() != 1
        || maps[0]["startFrame"] != 0
        || !source_time_matches(&maps[0]["sourceStart"], lo - start, &window["sourceStart"])
        || !source_time_matches(&maps[0]["sourceStart"], hi - start, &window["sourceEnd"])
    {
        return Err(invalid());
    }
    Ok(())
}

fn source_time_matches(origin: &Value, frames: u64, target: &Value) -> bool {
    let calculate = || -> Option<bool> {
        let n = i128::from(origin["num"].as_u64()?);
        let d = i128::from(origin["den"].as_u64()?);
        let tn = i128::from(target["num"].as_u64()?);
        let td = i128::from(target["den"].as_u64()?);
        if d == 0 || td == 0 {
            return None;
        }
        let left = n
            .checked_mul(30)?
            .checked_add(i128::from(frames).checked_mul(d)?)?
            .checked_mul(td)?;
        let right = tn.checked_mul(d)?.checked_mul(30)?;
        Some(left == right)
    };
    calculate() == Some(true)
}

fn validate_proposal(proposal: &Value, review: &Value, entries: &[Value]) -> AppResult<()> {
    let target = &proposal["target"];
    let entry = entries
        .iter()
        .find(|e| {
            [
                "clipId",
                "startFrame",
                "endFrame",
                "assetVersionId",
                "sha256",
            ]
            .iter()
            .all(|k| target[k] == e["window"][k])
        })
        .ok_or_else(invalid)?;
    let index = entries
        .iter()
        .position(|e| std::ptr::eq(e, entry))
        .ok_or_else(invalid)?;
    let category = proposal["category"].as_str().ok_or_else(invalid)?;
    let path = proposal["evidencePath"].as_str().ok_or_else(invalid)?;
    if !path.starts_with(&format!("/entries/{index}/")) && path != format!("/entries/{index}") {
        return Err(invalid());
    }
    let evidence = review.pointer(path).ok_or_else(invalid)?;
    let (action, requirement) = match category {
        "picture_narration" => ("reselect_source", "match_current_narration_and_brief"),
        "visible_artifacts" => (
            "compare_source_and_render",
            "determine_source_or_render_defect",
        ),
        "visible_text" => (
            "reselect_source",
            "original_text_compatible_with_narration_and_brief",
        ),
        _ => return Err(invalid()),
    };
    if proposal["action"] == "collect_evidence" {
        let expected = if category == "visible_text" {
            "obtain_readable_text_and_independent_comparison"
        } else {
            requirement
        };
        if proposal["requirement"] != expected {
            return Err(invalid());
        }
    } else if proposal["action"] != action
        || proposal["requirement"] != requirement
        || (category == "visible_text"
            && (evidence["id"] != entry["clipId"]
                || evidence["relation"] != "conflict"
                || proposal["reason"] != evidence["reason"]
                || entry["textReview"]["status"] != "reviewed"))
        || (category != "visible_text"
            && (evidence["kind"] != category
                || evidence["verdict"] != "issue_observed"
                || proposal["reason"] != evidence["observation"]))
    {
        return Err(invalid());
    }
    if proposal["reason"]
        .as_str()
        .is_none_or(|s| s.is_empty() || s.chars().count() > 500)
    {
        return Err(invalid());
    }
    Ok(())
}
