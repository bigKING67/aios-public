use sqlx::{PgPool, Row};
use tracing::error;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::types::LiveCenterPlaybackSegment;

pub(super) async fn mark_segment_upload_failed(
    pool: &PgPool,
    recording_id: Uuid,
    segment_id: Uuid,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.douyin_live_session_recording_segments
        SET
          upload_status = 'failed',
          processing_status = 'failed',
          updated_at = CURRENT_TIMESTAMP
        WHERE recording_id = $1
          AND segment_id = $2
          AND upload_status = 'uploading'
        "#,
    )
    .bind(recording_id)
    .bind(segment_id)
    .execute(pool)
    .await
    .map_err(|error| map_storage_db_error(error, "mark live center segment upload failed"))?;
    Ok(())
}

pub(super) async fn get_segment_for_upload_completion(
    pool: &PgPool,
    recording_id: Uuid,
    segment_id: Uuid,
) -> AppResult<LiveCenterPlaybackSegment> {
    get_segment_storage_target(
        pool,
        recording_id,
        segment_id,
        "get live center segment upload target",
    )
    .await
}

pub(super) async fn get_segment_for_playback(
    pool: &PgPool,
    recording_id: Uuid,
    segment_id: Uuid,
) -> AppResult<LiveCenterPlaybackSegment> {
    get_segment_storage_target(
        pool,
        recording_id,
        segment_id,
        "get live center segment playback source",
    )
    .await
}

pub(super) async fn get_segment_for_cleanup(
    pool: &PgPool,
    recording_id: Uuid,
    segment_id: Uuid,
) -> AppResult<LiveCenterPlaybackSegment> {
    get_segment_storage_target(
        pool,
        recording_id,
        segment_id,
        "get live center segment cleanup target",
    )
    .await
}

pub(super) async fn mark_segment_deleted(
    pool: &PgPool,
    recording_id: Uuid,
    segment_id: Uuid,
) -> AppResult<()> {
    let result = sqlx::query(
        r#"
        UPDATE ads.douyin_live_session_recording_segments
        SET
          upload_status = 'deleted',
          processing_status = 'skipped',
          updated_at = CURRENT_TIMESTAMP
        WHERE recording_id = $1
          AND segment_id = $2
          AND upload_status <> 'deleted'
          AND upload_status <> 'uploaded'
        "#,
    )
    .bind(recording_id)
    .bind(segment_id)
    .execute(pool)
    .await
    .map_err(|error| map_storage_db_error(error, "mark live center segment deleted"))?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

async fn get_segment_storage_target(
    pool: &PgPool,
    recording_id: Uuid,
    segment_id: Uuid,
    db_context: &str,
) -> AppResult<LiveCenterPlaybackSegment> {
    let row = sqlx::query(
        r#"
        SELECT
          r.session_key,
          s.raw_object_key,
          s.mime_type,
          s.file_size_bytes,
          s.upload_status,
          s.multipart_upload_id,
          s.multipart_part_size_bytes
        FROM ads.douyin_live_session_recording_segments s
        JOIN ads.douyin_live_session_recordings r
          ON r.recording_id = s.recording_id
        WHERE s.recording_id = $1
          AND s.segment_id = $2
          AND s.upload_status <> 'deleted'
        "#,
    )
    .bind(recording_id)
    .bind(segment_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| map_storage_db_error(error, db_context))?
    .ok_or(AppError::NotFound)?;

    Ok(LiveCenterPlaybackSegment {
        session_key: row.try_get::<String, _>("session_key").unwrap_or_default(),
        raw_object_key: row
            .try_get::<String, _>("raw_object_key")
            .unwrap_or_default(),
        mime_type: row.try_get::<Option<String>, _>("mime_type").ok().flatten(),
        file_size_bytes: row
            .try_get::<Option<i64>, _>("file_size_bytes")
            .ok()
            .flatten(),
        upload_status: row
            .try_get::<String, _>("upload_status")
            .unwrap_or_else(|_| "unknown".to_string()),
        multipart_upload_id: row
            .try_get::<Option<String>, _>("multipart_upload_id")
            .ok()
            .flatten(),
        multipart_part_size_bytes: row
            .try_get::<Option<i64>, _>("multipart_part_size_bytes")
            .ok()
            .flatten(),
    })
}

fn map_storage_db_error(error: sqlx::Error, context: &str) -> AppError {
    if matches!(error, sqlx::Error::RowNotFound) {
        return AppError::NotFound;
    }

    error!(
        ?error,
        context, "live center recording segment storage operation failed"
    );
    AppError::Internal
}
