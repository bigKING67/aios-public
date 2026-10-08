//! Source-bound shortlist for a current conflict. Eligibility is not semantic approval.
use super::super::{
    assets,
    visual_search::{self, VisualEvidence},
};
use super::{
    domain, output, repository as repo,
    types::{PlanDocument, Run},
};
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

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct Request {
    expected_version: i32,
    expected_plan_revision: i32,
    pub(super) job_id: Uuid,
    clip_id: String,
}

pub(in crate::marketing::content_assets::production) async fn search(
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
        || run.request.task_type != "picture_remix"
        || !["waiting", "paused"].contains(&run.status.as_str())
        || run.active_attempt.is_some()
    {
        return Err(domain::conflict());
    }
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
    let plan = repo::plan(&mut db, id, run.plan_revision)
        .await?
        .ok_or_else(domain::conflict)?;
    drop(db);
    // Reuse the draft's scope/lock contract before loading any candidate evidence.
    let clip = plan
        .document
        .clips
        .iter()
        .find(|c| c.id == request.clip_id)
        .ok_or_else(domain::conflict)?;
    let proposal = review["followUp"]["proposals"]
        .as_array()
        .ok_or_else(domain::conflict)?;
    let start: u64 = plan
        .document
        .clips
        .iter()
        .take_while(|c| c.id != clip.id)
        .map(|c| u64::from(c.end_ms - c.start_ms) * 30 / 1000)
        .sum();
    let end = start + u64::from(clip.end_ms - clip.start_ms) * 30 / 1000;
    if plan.document.locked_clip_ids.contains(&clip.id)
        || !proposal.iter().any(|p| {
            p["action"] == "reselect_source"
                && p["target"]["clipId"] == clip.id
                && p["target"]["startFrame"] == start
                && p["target"]["endFrame"] == end
        })
    {
        return Err(AppError::bad_request(
            "候选检索仅适用于未锁定的完整冲突片段",
        ));
    }
    let visuals = visual_search::planning_candidates(&state, &user, &run.request.asset_ids).await?;
    let candidates = shortlist(&run, &plan.document, &clip.id, visuals)?;
    let narration = super::super::search::narration_candidates(
        &state,
        &user,
        run.request
            .narration_asset_id
            .ok_or_else(domain::conflict)?,
        run.request.target_seconds * 1000,
    )
    .await?;
    let narration_context: Vec<_> = narration.iter().filter(|c|
        u64::from(c.start_ms)*30 < (end+60)*1000 && u64::from(c.end_ms)*30 > start.saturating_sub(60)*1000)
        .map(|c|json!({"transcriptId":c.transcript_id,"startMs":c.start_ms,"endMs":c.end_ms,"text":c.text,
            "overlapsTarget":u64::from(c.start_ms)*30<end*1000 && u64::from(c.end_ms)*30>start*1000})).collect();

    assets::revalidate(&state, &user, &run.sources).await?;
    let current = repo::get(&state.pool, &user.user_id, id).await?;
    if current.version != run.version
        || current.execution_version != run.execution_version
        || current.plan_revision != run.plan_revision
        || current.render_job_id != run.render_job_id
    {
        return Err(domain::conflict());
    }
    Ok(Json(
        json!({"schema":"aios.replacement-candidates.v1","binding":review["followUp"]["binding"],
        "expectedVersion":run.version,"expectedPlanRevision":run.plan_revision,"clipId":clip.id,
        "brief":run.request.brief,"narrationContext":narration_context,"target":{"startFrame":start,"endFrame":end},
        "conflicts":proposal.iter().filter(|p|p["target"]["clipId"]==clip.id).collect::<Vec<_>>(),
        "status":if candidates.is_empty(){"no_eligible_candidate"}else{"requires_semantic_selection"},
        "candidates":candidates,"deliveryApproved":false,"modelCalls":0,
        "limitations":["已有原片分析不是本次候选质量验收；顺序不代表语义排名","空字幕观察不证明无字；仍需核对当前台词、业务事实与商品身份"]}),
    ))
}

fn shortlist(
    run: &Run,
    plan: &PlanDocument,
    clip_id: &str,
    visuals: Vec<VisualEvidence>,
) -> AppResult<Vec<Value>> {
    let target = plan
        .clips
        .iter()
        .find(|c| c.id == clip_id)
        .ok_or_else(domain::conflict)?;
    let duration = target
        .end_ms
        .checked_sub(target.start_ms)
        .ok_or_else(domain::conflict)?;
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    // Interleave per asset so a verbose asset does not consume the shortlist.
    let mut buckets: Vec<_> = run
        .request
        .asset_ids
        .iter()
        .map(|id| visuals.iter().filter(move |v| v.asset_id == *id))
        .collect();
    loop {
        let mut progressed = false;
        for bucket in &mut buckets {
            let Some(v) = bucket.next() else { continue };
            progressed = true;
            let Some(end) = v.start_ms.checked_add(duration) else {
                continue;
            };
            if Some(v.asset_id) == run.request.narration_asset_id
                || end > v.end_ms
                || !run.sources.assets.iter().any(|a| {
                    a.asset_id == v.asset_id && a.sha256 == v.raw_sha256 && end <= a.duration_ms
                })
                || plan
                    .clips
                    .iter()
                    .any(|c| c.asset_id == v.asset_id && c.start_ms < end && v.start_ms < c.end_ms)
                || !seen.insert((v.asset_id, v.start_ms, end))
            {
                continue;
            }
            result.push(json!({"replacement":{"clipId":clip_id,"assetId":v.asset_id,"startMs":v.start_ms},
                "endMs":end,"evidence":v,"semanticStatus":"unverified","subtitlePolicy":"preserve-source"}));
            if result.len() == 30 {
                return Ok(result);
            }
        }
        if !progressed {
            return Ok(result);
        }
    }
}

#[cfg(test)]
pub(super) fn exercise_filter(run: &Run, original: &PlanDocument, id: &str) {
    let mut plan = original.clone();
    plan.clips.retain(|c| c.id == id);
    let target = &plan.clips[0];
    let source = run
        .sources
        .assets
        .iter()
        .find(|a| a.asset_id == target.asset_id)
        .unwrap();
    let duration = target.end_ms - target.start_ms;
    assert!(target.start_ms >= duration);
    let v = VisualEvidence {
        asset_id: target.asset_id,
        title: "fixture".into(),
        start_ms: 0,
        end_ms: duration,
        observation: "synthetic candidate".into(),
        visible_text: json!({"status":"missing"}),
        purpose_suggestion: String::new(),
        quality_signal: String::new(),
        analysis_result_id: Uuid::new_v4(),
        raw_sha256: source.sha256.clone(),
        model: "fixture".into(),
        prompt_version: "fixture".into(),
        analysis_schema_version: "fixture".into(),
        input_snapshot_hash: "fixture".into(),
        cache_key: "fixture".into(),
    };
    let good = shortlist(run, &plan, id, vec![v.clone(), v.clone()]).unwrap();
    assert_eq!(good.len(), 1);
    assert_eq!(good[0]["semanticStatus"], "unverified");
    let mut bad = v.clone();
    bad.raw_sha256 = "f".repeat(64);
    assert!(shortlist(run, &plan, id, vec![bad]).unwrap().is_empty());
    let mut bad = v.clone();
    bad.end_ms = duration - 1;
    assert!(shortlist(run, &plan, id, vec![bad]).unwrap().is_empty());
    let mut bad = v.clone();
    bad.start_ms = target.start_ms;
    bad.end_ms = target.end_ms;
    assert!(shortlist(run, &plan, id, vec![bad]).unwrap().is_empty());
    let mut bad = v;
    bad.asset_id = Uuid::new_v4();
    assert!(shortlist(run, &plan, id, vec![bad]).unwrap().is_empty());
}
