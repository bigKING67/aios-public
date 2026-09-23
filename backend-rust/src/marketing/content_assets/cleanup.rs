use std::{sync::Arc, time::Duration as StdDuration};

use sqlx::PgPool;
use tracing::{info, warn};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

const STALE_UPLOAD_RETENTION_HOURS: i64 = 24;
const STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS: u64 = 60 * 60;
const STALE_UPLOAD_CLEANUP_BATCH_LIMIT: i64 = 100;

pub(super) fn spawn_stale_upload_cleanup(state: Arc<AppState>) {
    tokio::spawn(async move {
        info!(
            retention_hours = STALE_UPLOAD_RETENTION_HOURS,
            interval_seconds = STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS,
            "content asset stale upload cleanup scheduler started"
        );
        loop {
            match cleanup_stale_upload_placeholders(
                &state.pool,
                STALE_UPLOAD_RETENTION_HOURS,
                STALE_UPLOAD_CLEANUP_BATCH_LIMIT,
            )
            .await
            {
                Ok(cleaned_count) if cleaned_count > 0 => {
                    info!(
                        cleaned_count,
                        "content asset stale upload placeholders soft-deleted"
                    );
                }
                Ok(_) => {}
                Err(error) => {
                    warn!(
                        ?error,
                        "content asset stale upload placeholder cleanup failed"
                    );
                }
            }
            tokio::time::sleep(StdDuration::from_secs(
                STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS,
            ))
            .await;
        }
    });
}

async fn cleanup_stale_upload_placeholders(
    pool: &PgPool,
    retention_hours: i64,
    batch_limit: i64,
) -> AppResult<i64> {
    let rows = sqlx::query(
        r#"
        WITH candidates AS (
          SELECT asset.asset_id
          FROM ads.marketing_content_assets AS asset
          WHERE asset.is_deleted = FALSE
            AND asset.source_type = 'manual_upload'
            AND asset.asset_status = 'uploading'
            AND asset.uploaded_at IS NULL
            AND asset.created_at < CURRENT_TIMESTAMP - ($1::INTEGER * INTERVAL '1 hour')
            AND NOT EXISTS (
              SELECT 1
              FROM ads.marketing_content_asset_objects AS raw_object
              WHERE raw_object.asset_id = asset.asset_id
                AND raw_object.object_role = 'raw'
                AND raw_object.status = 'active'
            )
          ORDER BY asset.created_at ASC
          LIMIT $2
        ),
        updated AS (
          UPDATE ads.marketing_content_assets AS asset
          SET is_deleted = TRUE,
              updated_at = CURRENT_TIMESTAMP
          FROM candidates
          WHERE asset.asset_id = candidates.asset_id
          RETURNING asset.asset_id, asset.raw_object_key, asset.created_at
        )
        INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
        SELECT
          asset_id,
          'manual_upload_expired',
          'system',
          '上传任务超过 24 小时未完成，已自动软删除',
          jsonb_build_object(
            'retention_hours', $1::INTEGER,
            'cleanup_reason', 'stale_manual_upload',
            'raw_object_key', raw_object_key,
            'created_at', created_at
          )
        FROM updated
        RETURNING asset_id
        "#,
    )
    .bind(retention_hours)
    .bind(batch_limit)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        warn!(
            ?error,
            "cleanup stale marketing content asset upload placeholders failed"
        );
        AppError::Internal
    })?;

    Ok(rows.len() as i64)
}

#[cfg(test)]
mod tests {
    use super::{
        STALE_UPLOAD_CLEANUP_BATCH_LIMIT, STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS,
        STALE_UPLOAD_RETENTION_HOURS,
    };

    #[test]
    fn stale_upload_cleanup_defaults_are_safe() {
        assert_eq!(STALE_UPLOAD_RETENTION_HOURS, 24);
        assert_eq!(STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS, 60 * 60);
        assert_eq!(STALE_UPLOAD_CLEANUP_BATCH_LIMIT, 100);
    }
}
