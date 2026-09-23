use std::collections::BTreeMap;

use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::AppResult;

use super::super::events::insert_event_tx;
use super::super::types::ContentAssetProcessingJobBackfillResponse;
use super::super::write_errors::map_write_error;
use super::object_keys::derive_output_key;

pub(crate) async fn backfill_derivative_processing_jobs(
    pool: &PgPool,
    limit: i64,
    actor: Option<&str>,
) -> AppResult<ContentAssetProcessingJobBackfillResponse> {
    let mut tx = pool.begin().await.map_err(|err| {
        map_write_error(
            err,
            "begin marketing content asset derivative backfill transaction failed",
        )
    })?;
    let rows = sqlx::query(
        r#"
        SELECT
          asset.asset_id,
          asset.raw_object_key,
          asset.file_size_bytes,
          asset.preview_object_key IS NULL AS missing_preview,
          asset.cover_object_key IS NULL AS missing_cover,
          EXISTS (
            SELECT 1
            FROM ads.marketing_content_asset_processing_jobs job
            WHERE job.asset_id = asset.asset_id
              AND job.job_type = 'preview'
              AND job.status <> 'cancelled'
          ) AS has_preview_job,
          EXISTS (
            SELECT 1
            FROM ads.marketing_content_asset_processing_jobs job
            WHERE job.asset_id = asset.asset_id
              AND job.job_type = 'cover'
              AND job.status <> 'cancelled'
          ) AS has_cover_job
        FROM ads.marketing_content_assets asset
        WHERE asset.is_deleted = FALSE
          AND asset.external_only = FALSE
          AND asset.raw_object_key IS NOT NULL
          AND (asset.preview_object_key IS NULL OR asset.cover_object_key IS NULL)
        ORDER BY
          CASE
            WHEN asset.preview_object_key IS NULL AND asset.cover_object_key IS NULL THEN 0
            WHEN asset.preview_object_key IS NULL THEN 1
            WHEN asset.cover_object_key IS NULL THEN 2
            ELSE 9
          END,
          asset.updated_at DESC,
          asset.created_at DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "query derivative backfill candidates failed"))?;

    let mut response = ContentAssetProcessingJobBackfillResponse {
        scanned_assets: rows.len() as i64,
        message: "没有需要补建的 preview / cover 队列任务".to_string(),
        ..ContentAssetProcessingJobBackfillResponse::default()
    };
    let mut affected_assets: BTreeMap<Uuid, (i64, i64)> = BTreeMap::new();

    for row in rows {
        let asset_id: Uuid = row.get("asset_id");
        let raw_object_key: Option<String> = row.get("raw_object_key");
        let Some(raw_object_key) = raw_object_key.filter(|value| !value.trim().is_empty()) else {
            continue;
        };
        let file_size_bytes: Option<i64> = row.try_get("file_size_bytes").ok();
        let missing_preview: bool = row.try_get("missing_preview").unwrap_or(false);
        let missing_cover: bool = row.try_get("missing_cover").unwrap_or(false);
        let has_preview_job: bool = row.try_get("has_preview_job").unwrap_or(false);
        let has_cover_job: bool = row.try_get("has_cover_job").unwrap_or(false);

        if missing_preview {
            response.candidate_jobs += 1;
            if has_preview_job {
                response.skipped_existing_jobs += 1;
            } else if insert_derivative_processing_job(
                &mut tx,
                asset_id,
                "preview",
                &raw_object_key,
                Some(derive_output_key(&raw_object_key, "preview", "mp4")),
            )
            .await?
            {
                response.created_jobs += 1;
                response.preview_jobs += 1;
                let entry = affected_assets.entry(asset_id).or_insert((0, 0));
                entry.0 += 1;
                entry.1 = file_size_bytes.unwrap_or(0);
            }
        }

        if missing_cover {
            response.candidate_jobs += 1;
            if has_cover_job {
                response.skipped_existing_jobs += 1;
            } else if insert_derivative_processing_job(
                &mut tx,
                asset_id,
                "cover",
                &raw_object_key,
                Some(derive_output_key(&raw_object_key, "cover", "webp")),
            )
            .await?
            {
                response.created_jobs += 1;
                response.cover_jobs += 1;
                let entry = affected_assets.entry(asset_id).or_insert((0, 0));
                entry.0 += 1;
                entry.1 = file_size_bytes.unwrap_or(0);
            }
        }
    }

    response.affected_assets = affected_assets.len() as i64;
    response.estimated_raw_bytes = affected_assets
        .values()
        .map(|(_, file_size_bytes)| *file_size_bytes)
        .sum();

    for (asset_id, (job_count, file_size_bytes)) in &affected_assets {
        insert_event_tx(
            &mut tx,
            *asset_id,
            "derivative_jobs_backfilled",
            actor,
            Some("已补建 preview / cover 队列任务；尚未运行 worker"),
            json!({
                "created_jobs": job_count,
                "estimated_raw_bytes": file_size_bytes,
                "worker_triggered": false
            }),
        )
        .await?;
    }

    tx.commit().await.map_err(|err| {
        map_write_error(
            err,
            "commit marketing content asset derivative backfill transaction failed",
        )
    })?;

    if response.created_jobs > 0 {
        response.message = format!(
            "已补建 {} 个队列任务，覆盖 {} 条素材；只写入队列，不会自动运行 worker",
            response.created_jobs, response.affected_assets
        );
    } else if response.skipped_existing_jobs > 0 {
        response.message = "缺失派生资产已有处理任务，未重复创建队列".to_string();
    }
    Ok(response)
}

async fn insert_derivative_processing_job(
    executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    asset_id: Uuid,
    job_type: &str,
    input_object_key: &str,
    output_object_key: Option<String>,
) -> AppResult<bool> {
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
    .bind(Uuid::new_v4())
    .bind(asset_id)
    .bind(job_type)
    .bind(input_object_key)
    .bind(output_object_key.as_deref())
    .bind(json!({ "created_by": "manual_derivative_backfill" }))
    .execute(&mut **executor)
    .await
    .map_err(|err| map_write_error(err, "insert derivative backfill processing job failed"))?
    .rows_affected();
    Ok(rows_affected > 0)
}
