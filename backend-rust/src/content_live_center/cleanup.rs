use std::{sync::Arc, time::Duration as StdDuration};

use sqlx::Row;
use tracing::{info, warn};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

use super::uploads;

const STALE_UPLOAD_RETENTION_HOURS: i64 = 24;
const STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS: u64 = 60 * 60;
const STALE_UPLOAD_CLEANUP_BATCH_LIMIT: i64 = 100;

pub(super) fn spawn_stale_upload_cleanup(state: Arc<AppState>) {
    tokio::spawn(async move {
        info!(
            retention_hours = STALE_UPLOAD_RETENTION_HOURS,
            interval_seconds = STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS,
            "live-center stale recording upload cleanup scheduler started"
        );
        loop {
            match cleanup_stale_recording_uploads(
                state.as_ref(),
                STALE_UPLOAD_RETENTION_HOURS,
                STALE_UPLOAD_CLEANUP_BATCH_LIMIT,
            )
            .await
            {
                Ok(cleaned_count) if cleaned_count > 0 => {
                    info!(
                        cleaned_count,
                        "live-center stale recording uploads marked failed"
                    );
                }
                Ok(_) => {}
                Err(error) => {
                    warn!(?error, "live-center stale recording upload cleanup failed");
                }
            }
            tokio::time::sleep(StdDuration::from_secs(
                STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS,
            ))
            .await;
        }
    });
}

async fn cleanup_stale_recording_uploads(
    state: &AppState,
    retention_hours: i64,
    batch_limit: i64,
) -> AppResult<i64> {
    let rows = sqlx::query(
        r#"
        SELECT
          segment_id,
          raw_object_key,
          multipart_upload_id
        FROM ads.douyin_live_session_recording_segments
        WHERE upload_status = 'uploading'
          AND uploaded_at IS NULL
          AND created_at < CURRENT_TIMESTAMP - ($1::INTEGER * INTERVAL '1 hour')
        ORDER BY created_at ASC
        LIMIT $2
        "#,
    )
    .bind(retention_hours)
    .bind(batch_limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|error| {
        warn!(?error, "cleanup stale live-center recording uploads failed");
        AppError::Internal
    })?;

    let candidates = rows
        .into_iter()
        .map(map_stale_upload_candidate)
        .collect::<Vec<_>>();
    if candidates.is_empty() {
        return Ok(0);
    }

    for candidate in candidates.iter() {
        if let Some(upload_id) = candidate.multipart_upload_id.as_deref() {
            if let Err(error) = uploads::abort_multipart_upload(
                &state.http_client,
                state.settings.as_ref(),
                candidate.raw_object_key.as_str(),
                upload_id,
            )
            .await
            {
                warn!(
                    ?error,
                    segment_id = %candidate.segment_id,
                    "live-center stale multipart abort failed; marking DB row failed anyway"
                );
            }
        }
    }

    let segment_ids = candidates
        .iter()
        .map(|candidate| candidate.segment_id)
        .collect::<Vec<_>>();
    let updated_rows = sqlx::query(
        r#"
        UPDATE ads.douyin_live_session_recording_segments
        SET upload_status = 'failed',
            processing_status = 'failed',
            updated_at = CURRENT_TIMESTAMP
        WHERE segment_id = ANY($1)
          AND upload_status = 'uploading'
        RETURNING segment_id
        "#,
    )
    .bind(segment_ids)
    .fetch_all(&state.pool)
    .await
    .map_err(|error| {
        warn!(?error, "cleanup stale live-center recording uploads failed");
        AppError::Internal
    })?;

    Ok(updated_rows.len() as i64)
}

struct StaleRecordingUploadCandidate {
    segment_id: Uuid,
    raw_object_key: String,
    multipart_upload_id: Option<String>,
}

fn map_stale_upload_candidate(row: sqlx::postgres::PgRow) -> StaleRecordingUploadCandidate {
    StaleRecordingUploadCandidate {
        segment_id: row
            .try_get::<Uuid, _>("segment_id")
            .unwrap_or_else(|_| Uuid::nil()),
        raw_object_key: row
            .try_get::<String, _>("raw_object_key")
            .unwrap_or_default(),
        multipart_upload_id: row
            .try_get::<Option<String>, _>("multipart_upload_id")
            .ok()
            .flatten(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        STALE_UPLOAD_CLEANUP_BATCH_LIMIT, STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS,
        STALE_UPLOAD_RETENTION_HOURS,
    };

    #[test]
    fn stale_recording_upload_cleanup_defaults_are_safe() {
        assert_eq!(STALE_UPLOAD_RETENTION_HOURS, 24);
        assert_eq!(STALE_UPLOAD_CLEANUP_INTERVAL_SECONDS, 60 * 60);
        assert_eq!(STALE_UPLOAD_CLEANUP_BATCH_LIMIT, 100);
    }
}
