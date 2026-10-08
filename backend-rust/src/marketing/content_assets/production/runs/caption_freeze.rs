//! Freeze host ASR evidence for deterministic, zero-model render-time repair.
use super::types::Run;
use crate::{error::AppResult, marketing::content_assets::production::repository};
use serde_json::{json, Value};
use sqlx::{PgConnection, Row};

pub(super) async fn attach(
    db: &mut PgConnection,
    run: &Run,
    document: &mut Value,
) -> AppResult<()> {
    if !run.request.generate_captions {
        return Ok(());
    }
    let Some(source) = run
        .sources
        .assets
        .iter()
        .find(|a| Some(a.asset_id) == run.request.narration_asset_id)
    else {
        return Ok(());
    };
    let row = sqlx::query("SELECT transcript_id,metadata->'word_timing' AS timing FROM ads.marketing_content_asset_transcripts WHERE asset_id=$1 AND status='active' AND provider='seed_asr' AND source_object_key=$2 AND metadata->>'source_sha256'=$3 ORDER BY created_at DESC LIMIT 1")
        .bind(source.asset_id).bind(&source.object_key).bind(&source.sha256)
        .fetch_optional(db).await.map_err(repository::db_error)?;
    let Some(row) = row else {
        return Ok(());
    };
    let timing: Value = row.try_get("timing").unwrap_or(Value::Null);
    if timing.is_null() {
        return Ok(());
    }
    let Some(cues) = document["captions"].as_array().filter(|c| !c.is_empty()) else {
        return Ok(());
    };
    let start = cues
        .first()
        .and_then(|c| c["anchor"]["sourceStart"]["num"].as_u64())
        .unwrap_or(0);
    let end = cues
        .last()
        .and_then(|c| c["anchor"]["sourceEnd"]["num"].as_u64())
        .unwrap_or(0);
    // Manually rewritten captions remain manual; never silently restore ASR text.
    let text: String = cues
        .iter()
        .filter_map(|c| c["text"].as_str())
        .collect::<String>()
        .replace('\n', "");
    let speech: String = timing["utterances"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|u| u["words"].as_array().into_iter().flatten())
        .filter(|w| {
            w["start_time"].as_u64().is_some_and(|t| t >= start)
                && w["end_time"].as_u64().is_some_and(|t| t <= end)
        })
        .filter_map(|w| w["text"].as_str())
        .map(str::trim)
        .collect();
    if speech != text {
        return Ok(());
    }
    let id: uuid::Uuid = row.get("transcript_id");
    document["captionRepair"] = json!({"policy":"asr-boundary-repair-v1","transcriptId":id,
        "clipId":"narration","assetVersionId":format!("{}-{}",source.asset_id,&source.sha256[..16]),
        "sourceSha256":source.sha256,"result":timing});
    Ok(())
}
