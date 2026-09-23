use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::super::mutation_types::NormalizedContentAssetUploadComplete;
use super::super::write_errors::map_write_error;
use super::object_keys::derive_output_key;

pub(crate) struct QueuedDerivativeProcessingJob {
    pub(crate) job_id: Uuid,
    pub(crate) job_type: String,
}

pub(crate) async fn complete_manual_upload_asset(
    pool: &PgPool,
    asset_id: Uuid,
    payload: NormalizedContentAssetUploadComplete,
    actor: Option<&str>,
) -> AppResult<Vec<QueuedDerivativeProcessingJob>> {
    let mut tx = pool.begin().await.map_err(|err| {
        map_write_error(
            err,
            "begin marketing content asset upload complete transaction failed",
        )
    })?;
    let row = sqlx::query(
        r#"
        SELECT raw_object_key
        FROM ads.marketing_content_assets
        WHERE asset_id = $1 AND is_deleted = FALSE
        FOR UPDATE
        "#,
    )
    .bind(asset_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "lock manual upload content asset failed"))?;

    let Some(row) = row else {
        return Err(AppError::NotFound);
    };
    let raw_object_key: Option<String> = row.get("raw_object_key");
    let raw_object_key = raw_object_key
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::bad_request("该素材缺少 raw 对象路径，无法确认上传完成"))?;

    sqlx::query(
        r#"
        UPDATE ads.marketing_content_assets
        SET
          asset_status = CASE
            WHEN asset_status IN ('uploading', 'external_only') THEN 'pending_processing'
            ELSE asset_status
          END,
          external_only = FALSE,
          file_size_bytes = COALESCE($2, file_size_bytes),
          raw_sha256 = COALESCE($3, raw_sha256),
          uploaded_at = COALESCE(uploaded_at, CURRENT_TIMESTAMP)
        WHERE asset_id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(asset_id)
    .bind(payload.file_size_bytes)
    .bind(&payload.raw_sha256)
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "complete manual upload content asset failed"))?;

    sqlx::query(
        r#"
        UPDATE ads.marketing_content_asset_objects
        SET
          status = 'active',
          size_bytes = COALESCE($2, size_bytes),
          sha256 = COALESCE($4, sha256),
          metadata = metadata || jsonb_build_object('upload_state', 'completed')
        WHERE asset_id = $1 AND object_role = 'raw' AND object_key = $3
        "#,
    )
    .bind(asset_id)
    .bind(payload.file_size_bytes)
    .bind(&raw_object_key)
    .bind(&payload.raw_sha256)
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "activate manual upload raw object failed"))?;

    sqlx::query(
        r#"
        UPDATE ads.marketing_content_asset_sources
        SET external_status = 'ingested'
        WHERE asset_id = $1 AND external_status = 'pending_manual_upload'
        "#,
    )
    .bind(asset_id)
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "mark manual upload source ingested failed"))?;

    let processing_jobs = [
        (
            "preview",
            Some(derive_output_key(&raw_object_key, "preview", "mp4")),
        ),
        (
            "cover",
            Some(derive_output_key(&raw_object_key, "cover", "webp")),
        ),
    ];
    let mut queued_jobs = Vec::new();
    for (job_type, output_object_key) in processing_jobs {
        let job_id = Uuid::new_v4();
        let rows_affected = sqlx::query(
            r#"
            INSERT INTO ads.marketing_content_asset_processing_jobs (
              job_id,
              asset_id,
              job_type,
              status,
              input_object_key,
              output_object_key,
              metadata
            )
            SELECT $1, $2, $3, 'queued', $4, $5, $6
            WHERE NOT EXISTS (
              SELECT 1
              FROM ads.marketing_content_asset_processing_jobs
              WHERE asset_id = $2
                AND job_type = $3
                AND status <> 'cancelled'
            )
            "#,
        )
        .bind(job_id)
        .bind(asset_id)
        .bind(job_type)
        .bind(&raw_object_key)
        .bind(output_object_key.as_deref())
        .bind(json!({
            "created_by": "manual_upload_complete",
            "processing_stage": "queued",
            "processing_stage_label": "已排队",
            "processing_progress_percent": 5,
        }))
        .execute(&mut *tx)
        .await
        .map_err(|err| map_write_error(err, "queue manual upload processing job failed"))?
        .rows_affected();
        if rows_affected > 0 {
            queued_jobs.push(QueuedDerivativeProcessingJob {
                job_id,
                job_type: job_type.to_string(),
            });
        }
    }

    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
        VALUES ($1, 'manual_upload_completed', $2, '视频源文件已上传到 TOS，等待生成预览和封面', $3)
        "#,
    )
    .bind(asset_id)
    .bind(actor)
    .bind(json!({
        "raw_object_key": raw_object_key,
        "file_size_bytes": payload.file_size_bytes
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "insert manual upload complete event failed"))?;

    tx.commit().await.map_err(|err| {
        map_write_error(
            err,
            "commit marketing content asset upload complete transaction failed",
        )
    })?;
    Ok(queued_jobs)
}
