//! Consume host-generated subtitles only from the same frozen original/ASR record.
use super::{captions::NarrationCaptions, types::Run};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use serde_json::{json, Value};
use sqlx::Row;

pub(super) async fn load(
    state: &AppState,
    user: &CurrentUser,
    run: &Run,
) -> AppResult<Option<(NarrationCaptions, Value)>> {
    if !run.request.generate_captions {
        return Ok(None);
    }
    super::super::assets::revalidate(state, user, &run.sources).await?;
    let source = run
        .sources
        .assets
        .iter()
        .find(|a| Some(a.asset_id) == run.request.narration_asset_id)
        .ok_or_else(|| AppError::bad_request("缺少主讲原片"))?;
    let row = sqlx::query("SELECT transcript_id,metadata->'caption_plan' AS caption_plan FROM ads.marketing_content_asset_transcripts WHERE asset_id=$1 AND status='active' AND provider='seed_asr' AND source_object_key=$2 AND metadata->>'source_sha256'=$3 ORDER BY created_at DESC LIMIT 1")
        .bind(source.asset_id).bind(&source.object_key).bind(&source.sha256)
        .fetch_optional(&state.pool).await.map_err(super::super::repository::db_error)?
        .ok_or_else(|| AppError::bad_request("主讲原片尚无同版本逐字ASR及字幕，请先完成字幕预处理"))?;
    let cache: Value = row.try_get("caption_plan").unwrap_or(Value::Null);
    let captions = select(
        &cache,
        source.asset_id,
        &source.sha256,
        run.request.target_seconds * 1000,
    )?;
    let id: uuid::Uuid = row.get("transcript_id");
    Ok(Some((
        captions,
        json!({"transcriptId":id,"sourceSha256":source.sha256,
        "provenance":cache["provenance"],"warnings":cache["warnings"],"termsVerified":false,
        "basis":"same-source-asr-caption-cache"}),
    )))
}

fn select(cache: &Value, asset: uuid::Uuid, hash: &str, end: u32) -> AppResult<NarrationCaptions> {
    let invalid = || {
        AppError::bad_request(
            "主讲字幕缓存缺失、来源不符或结束点截断字幕，请重新准备字幕或调整时长",
        )
    };
    if cache["schema"] != "aios.transcript-captions.v1" || !cache["provenance"].is_object() {
        return Err(invalid());
    }
    let mut captions: NarrationCaptions =
        serde_json::from_value(cache["document"].clone()).map_err(|_| invalid())?;
    if captions.asset_id != asset
        || captions.source_sha256 != hash
        || captions.cues.len() > 500
        || captions
            .cues
            .iter()
            .any(|c| c.start_ms < end && c.end_ms > end)
    {
        return Err(invalid());
    }
    captions.cues.retain(|c| c.start_ms < end);
    if captions.cues.is_empty() {
        return Err(invalid());
    }
    Ok(captions)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cache_requires_same_source_and_does_not_cut_words_or_captions() {
        let id = uuid::Uuid::new_v4();
        let cache = json!({"schema":"aios.transcript-captions.v1", "provenance":{"model":"fixture"},
            "document":{"assetId":id,"sourceSha256":"a".repeat(64),"cues":[
                {"id":"a","startMs":0,"endMs":1000,"text":"你好"},
                {"id":"b","startMs":1500,"endMs":2500,"text":"世界"}]}});
        assert_eq!(
            select(&cache, id, &"a".repeat(64), 1500)
                .unwrap()
                .cues
                .len(),
            1
        );
        assert!(select(&cache, id, &"a".repeat(64), 2000).is_err());
        assert!(select(&cache, id, &"b".repeat(64), 3000).is_err());
        assert!(select(&cache, uuid::Uuid::new_v4(), &"a".repeat(64), 3000).is_err());
        assert!(select(&Value::Null, id, &"a".repeat(64), 3000).is_err());
    }
}
