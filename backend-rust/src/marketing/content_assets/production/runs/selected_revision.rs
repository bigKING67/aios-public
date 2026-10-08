//! Builds an unsaved, bounded draft from current inspected evidence. No model or render calls.
use super::{domain, output, repository as repo, types::PlanDocument};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashSet, sync::Arc};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct Request {
    expected_version: i32,
    expected_plan_revision: i32,
    job_id: Uuid,
    replacements: Vec<Replacement>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Replacement {
    clip_id: String,
    asset_id: Uuid,
    start_ms: u32,
}

pub(in crate::marketing::content_assets::production) async fn draft(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<Request>,
) -> AppResult<Json<Value>> {
    super::guard(&state, &user, true)?;
    let run = repo::get(&state.pool, &user.user_id, id).await?;
    if run.version != request.expected_version
        || run.plan_revision != request.expected_plan_revision
        || run.render_job_id != Some(request.job_id)
        || !["waiting", "paused"].contains(&run.status.as_str())
        || run.request.task_type != "picture_remix"
        || run.active_attempt.is_some()
    {
        return Err(domain::conflict());
    }
    // Reuses receipt/source identity, permissions and current render relation validation.
    let result = output::read(&state, &user, id).await?;
    let review = result.get("selectedReview").ok_or_else(domain::conflict)?;
    if review["followUp"]["binding"]["jobId"] != json!(request.job_id) {
        return Err(domain::conflict());
    }
    let mut db = state
        .pool
        .acquire()
        .await
        .map_err(super::super::repository::db_error)?;
    let old = repo::plan(&mut db, id, run.plan_revision)
        .await?
        .ok_or_else(domain::conflict)?;
    let next = replace(&old.document, review, &request.replacements)?;
    domain::validate_plan(&next, &run.request, &run.sources)?;
    domain::preserve_locks(&old.document, &next, &[])?;
    let current = repo::get(&state.pool, &user.user_id, id).await?;
    if current.version != run.version
        || current.plan_revision != run.plan_revision
        || current.render_job_id != run.render_job_id
        || current.execution_version != run.execution_version
    {
        return Err(domain::conflict());
    }
    Ok(Json(
        json!({"schema":"aios.selected-revision-draft.v1", "saved":false,
        "deliveryApproved":false,"requiresReview":true,"binding":review["followUp"]["binding"],
        "revisionRequest":{"expectedVersion":run.version,"expectedPlanRevision":run.plan_revision,
            "document":next,"unlockClipIds":[]}}),
    ))
}

fn replace(
    old: &PlanDocument,
    review: &Value,
    replacements: &[Replacement],
) -> AppResult<PlanDocument> {
    if replacements.is_empty() || replacements.len() > old.clips.len() {
        return Err(AppError::bad_request("请选择需要替换的冲突片段"));
    }
    let proposals = review["followUp"]["proposals"]
        .as_array()
        .ok_or_else(domain::conflict)?;
    let mut seen = HashSet::new();
    let mut next = old.clone();
    for r in replacements {
        if !seen.insert(&r.clip_id) || old.locked_clip_ids.contains(&r.clip_id) {
            return Err(AppError::bad_request("替换片段重复或已锁定"));
        }
        let index = old
            .clips
            .iter()
            .position(|c| c.id == r.clip_id)
            .ok_or_else(domain::conflict)?;
        let clip = &old.clips[index];
        let duration = clip
            .end_ms
            .checked_sub(clip.start_ms)
            .ok_or_else(domain::conflict)?;
        let start: u64 = old.clips[..index]
            .iter()
            .map(|c| u64::from(c.end_ms - c.start_ms) * 30 / 1000)
            .sum();
        let end = start + u64::from(duration) * 30 / 1000;
        // Partial-window edits need a split contract; never widen their scope silently.
        if !proposals.iter().any(|p| {
            p["action"] == "reselect_source"
                && p["target"]["clipId"] == r.clip_id
                && p["target"]["startFrame"] == start
                && p["target"]["endFrame"] == end
        }) {
            return Err(AppError::bad_request(
                "仅支持已确认需重选的完整片段；局部窗口需先拆分",
            ));
        }
        if clip.asset_id == r.asset_id && clip.start_ms == r.start_ms {
            return Err(AppError::bad_request("替换不能继续使用同一原片区间"));
        }
        let target = &mut next.clips[index];
        target.asset_id = r.asset_id;
        target.start_ms = r.start_ms;
        target.end_ms = r
            .start_ms
            .checked_add(duration)
            .ok_or_else(domain::conflict)?;
        next.reasons[index] = "质检冲突后的替换候选；画面、原字幕与主讲匹配尚待复核".into();
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaces_only_failed_middle_clip_and_preserves_other_plan_fields() {
        let asset = Uuid::new_v4();
        let replacement_asset = Uuid::new_v4();
        let original = json!({"summary":"retain the approved edit",
            "clips":(0..3).map(|i|json!({"id":format!("p{i}"),"assetId":asset,
                "startMs":i*1000,"endMs":(i+1)*1000,"caption":"original caption","volume":0})).collect::<Vec<_>>(),
            "reasons":["approved first","failed middle","approved last"],"gaps":[],
            "lockedClipIds":["p0","p2"],
            "narrationCaptions":{"assetId":asset,"sourceSha256":"a".repeat(64),"cues":[
                {"id":"voice","startMs":0,"endMs":3000,"text":"original narration",
                 "style":{"fontHeight":0.04,"centerY":0.8,"color":"#FFFFFF","strokeWidth":0.002,"weight":700}}]}});
        let plan: PlanDocument = serde_json::from_value(original).unwrap();
        let before = serde_json::to_value(&plan).unwrap();
        let review = json!({"followUp":{"proposals":[{"action":"reselect_source",
            "category":"picture_narration","target":{"clipId":"p1","startFrame":30,"endFrame":60}}]}});
        let next = replace(
            &plan,
            &review,
            &[Replacement {
                clip_id: "p1".into(),
                asset_id: replacement_asset,
                start_ms: 5000,
            }],
        )
        .unwrap();
        let mut expected = before.clone();
        expected["clips"][1]["assetId"] = json!(replacement_asset);
        expected["clips"][1]["startMs"] = json!(5000);
        expected["clips"][1]["endMs"] = json!(6000);
        expected["reasons"][1] = json!("质检冲突后的替换候选；画面、原字幕与主讲匹配尚待复核");
        assert_eq!(serde_json::to_value(&next).unwrap(), expected);
        assert_eq!(serde_json::to_value(&plan).unwrap(), before);
        assert!(replace(
            &plan,
            &review,
            &[Replacement {
                clip_id: "p2".into(),
                asset_id: replacement_asset,
                start_ms: 5000
            }]
        )
        .is_err());
    }

    #[test]
    fn rejects_widening_uncertain_and_locked_edits() {
        let asset = Uuid::new_v4();
        let mut plan: PlanDocument = serde_json::from_value(json!({"summary":"fixture",
            "clips":[{"id":"p1","assetId":asset,"startMs":0,"endMs":1000,"caption":"","volume":0}],
            "reasons":["fixture"],"gaps":[]}))
        .unwrap();
        let replacement = [Replacement {
            clip_id: "p1".into(),
            asset_id: asset,
            start_ms: 1000,
        }];
        let mut review = json!({"followUp":{"proposals":[{"action":"reselect_source",
            "target":{"clipId":"p1","startFrame":0,"endFrame":30}}]}});
        assert!(replace(&plan, &review, &replacement).is_ok());
        review["followUp"]["proposals"][0]["target"]["endFrame"] = json!(15);
        assert!(replace(&plan, &review, &replacement).is_err());
        review["followUp"]["proposals"][0]["target"]["endFrame"] = json!(30);
        review["followUp"]["proposals"][0]["action"] = json!("collect_evidence");
        assert!(replace(&plan, &review, &replacement).is_err());
        review["followUp"]["proposals"][0]["action"] = json!("reselect_source");
        plan.locked_clip_ids.push("p1".into());
        assert!(replace(&plan, &review, &replacement).is_err());
    }
}
