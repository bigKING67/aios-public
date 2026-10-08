//! At most one explicitly enabled source-caption inspection per Run execution.
use super::{
    evidence_candidates::{Candidate, Evidence},
    planning_queue::Claim,
    repository,
};
use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

fn request(
    claim: &Claim,
    candidates: &[Candidate],
    model: &str,
    limit: u32,
) -> Option<(usize, Value)> {
    if claim.run.request.task_type != "picture_remix" {
        return None;
    }
    candidates.iter().enumerate().find_map(|(index, candidate)| {
        let Evidence::RawVideoAnalysis(evidence) = &candidate.evidence else { return None; };
        if Some(candidate.asset_id) == claim.run.request.narration_asset_id { return None; }
        let observations = evidence.visible_text["observations"].as_array()?;
        let mut top: f64 = 1.0;
        let mut bottom: f64 = 0.0;
        for item in observations.iter().filter(|v| v["role"] == "dialogue_subtitle") {
            let bounds = item["box"].as_array()?;
            let y = bounds.get(1)?.as_f64()?;
            let h = bounds.get(3)?.as_f64()?;
            top = top.min(y);
            bottom = bottom.max(y + h);
        }
        if !top.is_finite() || !bottom.is_finite() || top < 0.0 || bottom > 1.0 || bottom <= top || bottom-top > 0.25 { return None; }
        let source = claim.run.sources.assets.iter().find(|s| s.asset_id == candidate.asset_id)?;
        let start = (u64::from(candidate.start_ms)*30).div_ceil(1000);
        let end = (u64::from(candidate.end_ms.min(source.duration_ms))*30)/1000;
        let frames = end.checked_sub(start)?.min(150);
        if frames < 30 || source.sha256.len() != 64 || !source.sha256.bytes().all(|b| b.is_ascii_hexdigit()) { return None; }
        Some((index,json!({"runId":claim.run.run_id,"executionVersion":claim.run.execution_version,
            "assetVersionId":format!("{}-{}",source.asset_id,&source.sha256[..16]),"sourceSha256":source.sha256,
            "startFrame":start,"frames":frames,"requiredFrames":30,"region":{"top":top,"bottom":bottom},
            "model":model,"maxCalls":limit})))
    })
}

pub(super) async fn ready(
    state: &AppState,
    claim: &Claim,
    candidates: &mut [Candidate],
) -> AppResult<bool> {
    if claim.run.request.task_type != "picture_remix"
        || std::env::var("AIOS_CAPTION_PREFLIGHT_ENABLED").as_deref() != Ok("true")
    {
        return Ok(true);
    }
    let model = std::env::var("AIOS_VISUAL_REVIEW_MODEL").unwrap_or_default();
    let limit = std::env::var("AIOS_CAPTION_PREFLIGHT_MAX_CALLS")
        .unwrap_or_else(|_| "3".into())
        .parse::<u32>()
        .map_err(|_| AppError::bad_request("字幕预检调用上限无效"))?;
    if model.trim().is_empty() || model.len() > 128 || !(3..=7).contains(&limit) {
        return Err(AppError::bad_request("字幕预检模型或调用上限未配置"));
    }
    let Some((index, input)) = request(claim, candidates, &model, limit) else {
        return Ok(true);
    };
    let source = claim
        .run
        .sources
        .assets
        .iter()
        .find(|s| s.asset_id == candidates[index].asset_id)
        .ok_or(AppError::Internal)?;
    let Some(report) = poll(state, claim, source.asset_id, &source.object_key, &input).await?
    else {
        return Ok(false);
    };
    if let Some(narrowed) = super::caption_windows::narrow(&candidates[index], &input, &report)? {
        candidates[index] = narrowed;
    }
    if let Evidence::RawVideoAnalysis(evidence) = &mut candidates[index].evidence {
        evidence.visible_text["captionPreflight"] = report;
    }
    Ok(true)
}

pub(super) async fn poll(
    state: &AppState,
    claim: &Claim,
    asset: Uuid,
    key: &str,
    input: &Value,
) -> AppResult<Option<Value>> {
    use super::super::repository::db_error;
    let mut tx = state.pool.begin().await.map_err(db_error)?;
    let mut run = repository::lock(&mut tx, &claim.owner, claim.run.run_id).await?;
    if run.status != "running"
        || run.stage != "planning"
        || run.pause_requested
        || run.active_attempt != Some(claim.token)
        || run.execution_version != claim.run.execution_version
    {
        return Ok(None);
    }
    let row = sqlx::query("SELECT status,metadata,asset_id,input_object_key FROM ads.marketing_content_asset_processing_jobs WHERE job_type='analysis' AND metadata->>'operation'='source_caption_preflight_v1' AND metadata->'caption_request'->>'runId'=$1 AND metadata->'caption_request'->'executionVersion'=$2 ORDER BY created_at LIMIT 1")
        .bind(run.run_id.to_string()).bind(json!(run.execution_version)).fetch_optional(&mut *tx).await.map_err(db_error)?;
    if let Some(row) = row {
        let metadata: Value = row.get("metadata");
        if metadata["caption_request"] != *input
            || row.get::<Uuid, _>("asset_id") != asset
            || row.get::<Option<String>, _>("input_object_key").as_deref() != Some(key)
        {
            return Err(AppError::Conflict(
                "字幕预检输入已改变，不重复发起调用".into(),
            ));
        }
        match row.get::<String, _>("status").as_str() {
            "succeeded" => {
                let report = &metadata["host_caption_preflight"]["report"];
                let digest = format!(
                    "{:x}",
                    Sha256::digest(serde_json::to_vec(report).map_err(|_| AppError::Internal)?)
                );
                let empty =
                    report["status"] == "needs_inspection" && report["candidates"] == json!([]);
                if report["deliveryApproved"] != false
                    || metadata["host_caption_preflight"]["deliveryApproved"] != false
                    || metadata["host_caption_preflight"]["reportSha256"] != digest
                    || (!empty
                        && (report["schema"] != "aios.source-caption-preflight.v1"
                            || report["status"] != "candidates_observed"
                            || !report["candidates"].is_array()
                            || report["sourceBinding"]["assetVersionId"]
                                != input["assetVersionId"]
                            || report["sourceBinding"]["sourceSha256"] != input["sourceSha256"]
                            || report["executableEditAllowed"] != false))
                {
                    return Err(AppError::bad_request("字幕预检回执无效"));
                }
                tx.commit().await.map_err(db_error)?;
                return Ok(Some(report.clone()));
            }
            "queued" | "running" => {}
            _ => return Err(AppError::bad_request("字幕预检失败，不自动重复收费")),
        }
    } else {
        sqlx::query("INSERT INTO ads.marketing_content_asset_processing_jobs(job_id,asset_id,job_type,status,input_object_key,max_attempts,metadata) VALUES($1,$2,'analysis','queued',$3,1,$4)")
            .bind(Uuid::new_v4()).bind(asset).bind(key).bind(json!({"operation":"source_caption_preflight_v1","caption_request":input}))
            .execute(&mut *tx).await.map_err(db_error)?;
    }
    let updated = sqlx::query("UPDATE ads.content_production_plan_attempts SET status='queued',expires_at=clock_timestamp()+INTERVAL '10 seconds' WHERE attempt_id=$1 AND status='running' AND expires_at>clock_timestamp() AND created_at>clock_timestamp()-INTERVAL '30 minutes'")
        .bind(claim.token).execute(&mut *tx).await.map_err(db_error)?;
    if updated.rows_affected() != 1 {
        return Err(AppError::bad_request("字幕预检等待超时或规划任务已失效"));
    }
    run.waiting_reason = Some("source_caption_preflight".into());
    repository::save(&mut tx, &mut run).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_only_bounded_observed_subtitle_regions() {
        let mut run = super::super::evidence_tests::run();
        run.request.task_type = "picture_remix".into();
        let asset = run.sources.assets[0].asset_id;
        let mut visual = super::super::evidence_tests::visual(asset);
        visual.visible_text =
            json!({"observations":[{"role":"dialogue_subtitle","box":[0.1,0.7,0.8,0.1]}]});
        let mut candidate = Candidate {
            asset_id: asset,
            title: "fixture".into(),
            start_ms: 1001,
            end_ms: 7000,
            evidence: Evidence::RawVideoAnalysis(Box::new(visual)),
        };
        let mut claim = Claim {
            owner: "fixture".into(),
            token: Uuid::new_v4(),
            run,
        };
        let (_, input) = request(
            &claim,
            &[candidate.clone(), candidate.clone()],
            "fixture",
            3,
        )
        .unwrap();
        assert_eq!(input["startFrame"], 31);
        assert!(input["frames"].as_u64().unwrap() <= 150);
        assert_eq!(input["requiredFrames"], 30);
        candidate.end_ms = 1500;
        assert!(request(&claim, &[candidate.clone()], "fixture", 3).is_none());
        candidate.end_ms = 7000;
        if let Evidence::RawVideoAnalysis(e) = &mut candidate.evidence {
            e.visible_text["observations"][0]["box"] = json!([0.1, 0.3, 0.8, 0.5]);
        }
        assert!(request(&claim, &[candidate.clone()], "fixture", 3).is_none());
        claim.run.request.narration_asset_id = Some(asset);
        assert!(request(&claim, &[candidate], "fixture", 3).is_none());
    }
}
