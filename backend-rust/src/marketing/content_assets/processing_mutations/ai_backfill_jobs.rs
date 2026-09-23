use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::super::{
    mutation_types::{
        ContentAssetAiJobBackfillResponse, NormalizedContentAssetAiJobBackfill,
        NormalizedContentAssetAnalysisJobCreate, NormalizedContentAssetTranscriptJobCreate,
    },
    write_errors::map_write_error,
};
use super::{
    analysis_jobs::create_analysis_processing_job,
    transcript_jobs::create_transcript_processing_job,
};

pub(crate) async fn backfill_ai_processing_jobs(
    pool: &PgPool,
    payload: NormalizedContentAssetAiJobBackfill,
    actor: Option<&str>,
) -> AppResult<ContentAssetAiJobBackfillResponse> {
    let asset_ids = query_ai_backfill_candidates(pool, &payload).await?;
    let mut response = ContentAssetAiJobBackfillResponse {
        job_type: payload.job_type.clone(),
        source: payload.source.clone(),
        profile: payload.profile.clone(),
        scanned_assets: asset_ids.len() as i64,
        candidate_assets: asset_ids.len() as i64,
        ..Default::default()
    };

    for asset_id in asset_ids {
        let result = if payload.job_type == "analysis" {
            create_analysis_processing_job(
                pool,
                asset_id,
                NormalizedContentAssetAnalysisJobCreate {
                    source: payload.source.clone(),
                    profile: payload.profile.clone(),
                    force: false,
                },
                actor,
            )
            .await
        } else {
            create_transcript_processing_job(
                pool,
                asset_id,
                NormalizedContentAssetTranscriptJobCreate {
                    source: payload.source.clone(),
                    force: false,
                },
                actor,
            )
            .await
        };

        match result {
            Ok(_) => response.queued_jobs += 1,
            Err(AppError::Conflict(message)) if message.contains("运行中") => {
                response.skipped_running_jobs += 1;
            }
            Err(AppError::Conflict(message)) if message.contains("已有") => {
                response.skipped_ready_assets += 1;
            }
            Err(AppError::Conflict(_)) => response.skipped_existing_jobs += 1,
            Err(AppError::BadRequest(message))
                if message.contains("无法创建")
                    || message.contains("没有可用")
                    || message.contains("尚未上传")
                    || message.contains("视频超过 30 分钟") =>
            {
                response.skipped_no_input += 1;
            }
            Err(AppError::NotFound) => response.skipped_no_input += 1,
            Err(error) => return Err(error),
        }
    }

    response.message = build_backfill_message(&response);
    Ok(response)
}

async fn query_ai_backfill_candidates(
    pool: &PgPool,
    payload: &NormalizedContentAssetAiJobBackfill,
) -> AppResult<Vec<Uuid>> {
    let sql = if payload.job_type == "analysis" {
        r#"
        SELECT asset.asset_id
        FROM ads.marketing_content_assets asset
        WHERE asset.is_deleted = FALSE
          AND asset.external_only = FALSE
          AND asset.asset_type = 'video'
          AND (asset.duration_seconds IS NULL OR asset.duration_seconds < 1800)
          AND asset.analysis_object_key IS NULL
          AND asset.ai_analyzed_at IS NULL
          AND (
            ($2 = 'preview' AND asset.preview_object_key IS NOT NULL)
            OR ($2 = 'raw' AND asset.raw_object_key IS NOT NULL)
            OR ($2 = 'auto' AND COALESCE(asset.preview_object_key, asset.raw_object_key) IS NOT NULL)
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ads.marketing_content_asset_processing_jobs job
            WHERE job.asset_id = asset.asset_id
              AND job.job_type = 'analysis'
              AND job.status IN ('queued', 'running')
          )
        ORDER BY asset.updated_at DESC, asset.created_at DESC
        LIMIT $1
        "#
    } else {
        r#"
        SELECT asset.asset_id
        FROM ads.marketing_content_assets asset
        WHERE asset.is_deleted = FALSE
          AND asset.external_only = FALSE
          AND asset.asset_type = 'video'
          AND (asset.duration_seconds IS NULL OR asset.duration_seconds < 1800)
          AND asset.transcript_object_key IS NULL
          AND asset.transcribed_at IS NULL
          AND NULLIF(BTRIM(COALESCE(asset.script_excerpt, '')), '') IS NULL
          AND (
            ($2 = 'preview' AND asset.preview_object_key IS NOT NULL)
            OR ($2 = 'raw' AND asset.raw_object_key IS NOT NULL)
            OR ($2 = 'auto' AND COALESCE(asset.preview_object_key, asset.raw_object_key) IS NOT NULL)
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ads.marketing_content_asset_processing_jobs job
            WHERE job.asset_id = asset.asset_id
              AND job.job_type = 'transcript'
              AND job.status IN ('queued', 'running')
          )
        ORDER BY asset.updated_at DESC, asset.created_at DESC
        LIMIT $1
        "#
    };

    let rows = sqlx::query(sql)
        .bind(payload.limit)
        .bind(&payload.source)
        .fetch_all(pool)
        .await
        .map_err(|err| map_write_error(err, "query content asset ai backfill candidates failed"))?;
    Ok(rows.into_iter().map(|row| row.get("asset_id")).collect())
}

fn build_backfill_message(response: &ContentAssetAiJobBackfillResponse) -> String {
    let task_label = if response.job_type == "analysis" {
        "AI 分析"
    } else {
        "脚本/SRT"
    };
    format!(
        "已排队 {queued} 个{task_label}任务，候选 {candidates} 条，跳过 {skipped} 条；后台处理器会异步执行。",
        queued = response.queued_jobs,
        candidates = response.candidate_assets,
        skipped = response.skipped_ready_assets
            + response.skipped_running_jobs
            + response.skipped_no_input
            + response.skipped_existing_jobs,
    )
}
