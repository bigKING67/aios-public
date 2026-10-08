//! Expose source-bound inspection candidates through the existing versioned plan flow.
use super::{
    captions::{Cue, NarrationCaptions},
    domain,
    types::{PlanDocument, Run},
};
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

fn digest(value: &Value) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(value).expect("JSON value serializes"))
    )
}

pub(super) fn inspect(
    run: &Run,
    job: Uuid,
    receipt: &Value,
    snapshot: &Value,
    plan: &PlanDocument,
) -> AppResult<Option<Value>> {
    let review = &receipt["host_caption_review"];
    if review["candidateRendered"] != true {
        return Ok(None);
    }
    let invalid = || AppError::Conflict("字幕候选与当前工程或渲染回执不一致，请重新读取".into());
    let candidate = &review["candidate"];
    let document = &candidate["document"];
    let rendered = &review["candidateRender"];
    let rereview = &review["candidateReview"];
    let frozen = &snapshot["editDocument"];
    let key = format!(
        "production/{}/{job}/caption-candidate.mp4",
        run.project_id.ok_or_else(invalid)?
    );
    let sha = digest(document);
    if !super::super::render_binding::receipt_matches(run.sources.render_binding.as_ref(), receipt)
        || !super::super::render_binding::receipt_matches(
            run.sources.render_binding.as_ref(),
            &rendered["receipt"],
        )
        || frozen.is_null()
        || document["revision"].as_u64()
            != frozen["revision"]
                .as_u64()
                .and_then(|revision| revision.checked_add(1))
        || candidate["status"] != "candidate"
        || rendered["status"] != "inspection_pending"
        || rendered["outputObjectKey"] != key
        || candidate["baseDocumentSha256"] != digest(frozen)
        || rendered["baseDocumentSha256"] != candidate["baseDocumentSha256"]
        || candidate["documentSha256"] != sha
        || rendered["documentSha256"] != sha
        || rendered["receipt"]["edit_document"]["sha256"] != sha
        || rendered["reviewSha256"] != digest(rereview)
        || rereview["documentSha256"] != sha
        || rereview["effectiveDocumentSha256"] != sha
        || rereview["semanticIssueCount"] != 0
        || receipt["host_run_id"] != run.run_id.to_string()
        || receipt["host_project_id"] != run.project_id.unwrap().to_string()
        || receipt["host_revision"].as_i64() != run.project_revision.map(i64::from)
        || receipt["host_execution_version"] != run.execution_version
        || receipt["host_plan_revision"] != run.plan_revision
    {
        return Err(invalid());
    }
    let technical = &rendered["receipt"]["host_inspection"];
    let (width, height) = run
        .sources
        .output_profile
        .dimensions(&run.sources.aspect)
        .ok_or_else(invalid)?;
    if technical["schema"] != "aios.media-inspection.v1"
        || technical["status"] != "passed"
        || technical["width"] != width
        || technical["height"] != height
        || technical["fps"].as_f64() != Some(30.0)
        || technical["outputProfile"] != json!(run.sources.output_profile)
    {
        return Err(invalid());
    }
    let mut effective = frozen.clone();
    if effective
        .as_object_mut()
        .ok_or_else(invalid)?
        .remove("captionRepair")
        .is_some()
    {
        effective["captions"] = receipt["caption_quality"]["repair"]["captions"].clone();
    }
    if candidate["baseEffectiveDocumentSha256"] != digest(&effective) {
        return Err(invalid());
    }
    let old = effective["captions"].as_array().ok_or_else(invalid)?;
    let cues = document["captions"].as_array().ok_or_else(invalid)?;
    if old.len() != cues.len() || cues.is_empty() || cues.len() > 500 {
        return Err(invalid());
    }
    let mut changes = Vec::new();
    for (before, after) in old.iter().zip(cues) {
        let mut normalized = after.clone();
        let text = after["text"].as_str().ok_or_else(invalid)?;
        if before["text"]
            .as_str()
            .ok_or_else(invalid)?
            .replace('\n', "")
            != text.replace('\n', "")
        {
            return Err(invalid());
        }
        if before["text"] != after["text"] {
            changes.push(
                json!({"captionId":after["id"],"before":before["text"],"after":after["text"]}),
            );
        }
        normalized["text"] = before["text"].clone();
        if &normalized != before {
            return Err(invalid());
        }
    }
    let mut normalized = document.clone();
    normalized["captions"] = effective["captions"].clone();
    normalized["revision"] = effective["revision"].clone();
    if normalized != effective {
        return Err(invalid());
    }
    let source = run
        .sources
        .assets
        .iter()
        .find(|s| Some(s.asset_id) == run.request.narration_asset_id)
        .ok_or_else(invalid)?;
    if source.sha256.len() != 64 || !source.sha256.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(invalid());
    }
    let source_version = format!("{}-{}", source.asset_id, &source.sha256[..16]);
    let mut converted = Vec::with_capacity(cues.len());
    for cue in cues {
        let anchor = &cue["anchor"];
        let style = match cue["stylePreset"].as_str() {
            Some("basic-bottom-v1") if cue.get("style").is_none() => None,
            Some("source-style-v1") => {
                Some(serde_json::from_value(cue["style"].clone()).map_err(|_| invalid())?)
            }
            _ => return Err(invalid()),
        };
        if anchor["kind"] != "source"
            || anchor["clipId"] != "narration"
            || anchor["assetVersionId"] != source_version
            || anchor["sourceStart"]["den"] != 1000
            || anchor["sourceEnd"]["den"] != 1000
        {
            return Err(invalid());
        }
        converted.push(Cue {
            style,
            id: cue["id"].as_str().ok_or_else(invalid)?.into(),
            text: cue["text"].as_str().ok_or_else(invalid)?.into(),
            start_ms: anchor["sourceStart"]["num"]
                .as_u64()
                .and_then(|n| n.try_into().ok())
                .ok_or_else(invalid)?,
            end_ms: anchor["sourceEnd"]["num"]
                .as_u64()
                .and_then(|n| n.try_into().ok())
                .ok_or_else(invalid)?,
        });
    }
    let mut revised = plan.clone();
    revised.narration_captions = Some(NarrationCaptions {
        asset_id: source.asset_id,
        source_sha256: source.sha256.clone(),
        cues: converted,
    });
    domain::validate_plan(&revised, &run.request, &run.sources)?;
    if snapshot["derivedAssets"]
        .as_array()
        .is_some_and(|a| !a.is_empty())
    {
        // Reuse the same preservation contract as plan save/adoption before
        // exposing a candidate which can be submitted through those APIs.
        super::treated_captions::revise(
            serde_json::from_value(snapshot.clone()).map_err(|_| invalid())?,
            &revised,
        )?;
    }
    Ok(Some(
        json!({"status":"inspection_pending","deliveryApproved":false,"objectKey":key,
        "documentSha256":sha,"captionChanges":changes,"inspection":technical,"review":rereview,
        "expectedVersion":run.version,"expectedPlanRevision":run.plan_revision,
        "expectedProjectRevision":run.project_revision,"planDocument":revised}),
    ))
}

#[cfg(test)]
mod tests;
