use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::super::mutation_types::NormalizedContentAssetTranscriptJobCreate;
use super::super::write_errors::map_write_error;
use super::object_keys::{resolve_analysis_input_role, resolve_transcript_input_key};

const CONTENT_ASSET_AI_LONG_VIDEO_SECONDS: f64 = 30.0 * 60.0;

pub(crate) async fn create_transcript_processing_job(
    pool: &PgPool,
    asset_id: Uuid,
    payload: NormalizedContentAssetTranscriptJobCreate,
    actor: Option<&str>,
) -> AppResult<Uuid> {
    let transcript_source = payload.source.clone();
    let mut tx = pool.begin().await.map_err(|err| {
        map_write_error(err, "begin content asset transcript job transaction failed")
    })?;

    let asset_row = sqlx::query(
        r#"
        SELECT
          external_only,
          raw_object_key,
          preview_object_key,
          transcript_object_key,
          duration_seconds::FLOAT8 AS duration_seconds
        FROM ads.marketing_content_assets
        WHERE asset_id = $1 AND is_deleted = FALSE
        FOR UPDATE
        "#,
    )
    .bind(asset_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "query content asset before transcript job failed"))?;
    let Some(asset_row) = asset_row else {
        return Err(AppError::NotFound);
    };

    let external_only: bool = asset_row.try_get("external_only").unwrap_or(false);
    if external_only {
        return Err(AppError::bad_request(
            "该素材尚未上传到 TOS，无法创建脚本/SRT 任务",
        ));
    }
    let duration_seconds: Option<f64> = asset_row.try_get("duration_seconds").ok();
    if duration_seconds
        .map(|duration| duration >= CONTENT_ASSET_AI_LONG_VIDEO_SECONDS)
        .unwrap_or(false)
    {
        return Err(AppError::bad_request(
            "视频超过 30 分钟，不建议自动创建脚本/SRT 任务",
        ));
    }

    let raw_object_key: Option<String> = asset_row.try_get("raw_object_key").ok();
    let preview_object_key: Option<String> = asset_row.try_get("preview_object_key").ok();
    let input_object_key = resolve_transcript_input_key(
        &payload.source,
        raw_object_key.as_deref(),
        preview_object_key.as_deref(),
    )?;
    let input_role = resolve_analysis_input_role(
        &input_object_key,
        raw_object_key.as_deref(),
        preview_object_key.as_deref(),
    );

    let active_job = sqlx::query(
        r#"
        SELECT
          job_id,
          status,
          COALESCE(metadata->>'transcript_source', 'auto') AS transcript_source
        FROM ads.marketing_content_asset_processing_jobs
        WHERE asset_id = $1
          AND job_type = 'transcript'
          AND status IN ('queued', 'running')
        ORDER BY
          CASE status WHEN 'running' THEN 0 ELSE 1 END,
          started_at DESC NULLS LAST,
          queued_at ASC,
          created_at ASC
        LIMIT 1
        "#,
    )
    .bind(asset_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "query active transcript job failed"))?;
    if let Some(row) = active_job {
        let job_id: Uuid = row.get("job_id");
        let status: String = row.try_get("status").unwrap_or_default();
        let active_source: String = row.try_get("transcript_source").unwrap_or_default();
        if status == "running" {
            return Err(AppError::Conflict(
                "该素材已有运行中的脚本/SRT 任务".to_string(),
            ));
        }
        if !payload.force && active_source == payload.source {
            tx.commit().await.map_err(|err| {
                map_write_error(err, "commit existing transcript job transaction failed")
            })?;
            return Ok(job_id);
        }
        if !payload.force {
            return Err(AppError::Conflict(
                "该素材已有排队中的脚本/SRT 任务，请等待完成后再重试".to_string(),
            ));
        }
    }

    if !payload.force {
        let existing_transcript_object: Option<String> =
            asset_row.try_get("transcript_object_key").ok();
        if existing_transcript_object.is_some() {
            return Err(AppError::Conflict(
                "该素材已有脚本/SRT 结果；如需覆盖请使用 force=true".to_string(),
            ));
        }
    } else {
        sqlx::query(
            r#"
            UPDATE ads.marketing_content_asset_processing_jobs
            SET status = 'cancelled',
                finished_at = CURRENT_TIMESTAMP,
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'cancelled_by_new_transcript_job', TRUE,
                  'cancelled_by', $2,
                  'cancelled_at', CURRENT_TIMESTAMP
                )
            WHERE asset_id = $1
              AND job_type = 'transcript'
              AND status = 'queued'
            "#,
        )
        .bind(asset_id)
        .bind(actor)
        .execute(&mut *tx)
        .await
        .map_err(|err| map_write_error(err, "cancel superseded transcript jobs failed"))?;
    }

    let job_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_processing_jobs (
          job_id,
          asset_id,
          job_type,
          status,
          input_object_key,
          metadata
        ) VALUES ($1, $2, 'transcript', 'queued', $3, $4)
        "#,
    )
    .bind(job_id)
    .bind(asset_id)
    .bind(&input_object_key)
    .bind(json!({
        "created_by": "user_request",
        "transcript_source": &transcript_source,
        "input_role": &input_role,
        "force": payload.force,
        "requested_by": actor,
        "processing_stage": "queued",
        "processing_stage_label": "脚本/SRT 已排队",
        "processing_progress_percent": 5,
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "create transcript processing job failed"))?;

    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
        VALUES ($1, 'transcript_job_queued', $2, $3, $4)
        "#,
    )
    .bind(asset_id)
    .bind(actor)
    .bind(match input_role.as_str() {
        "raw" => "已创建原片脚本/SRT 任务",
        "preview" => "已创建预览脚本/SRT 任务",
        _ => "已创建自动来源脚本/SRT 任务",
    })
    .bind(json!({
        "jobId": job_id,
        "transcriptSource": &transcript_source,
        "inputRole": &input_role,
        "inputObjectKey": input_object_key,
        "force": payload.force,
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "insert transcript job queued event failed"))?;

    tx.commit().await.map_err(|err| {
        map_write_error(
            err,
            "commit content asset transcript job transaction failed",
        )
    })?;
    Ok(job_id)
}
