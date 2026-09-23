use chrono::{DateTime, NaiveDateTime, Utc};
use serde_json::Value;
use sqlx::{postgres::PgRow, PgPool, Row};
use tracing::error;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::repository_sql::{
    ANALYSIS_SQL, DATE_BOUNDS_SQL, DETAIL_SESSION_SQL, LIST_SESSIONS_SQL, MINUTE_METRICS_SQL,
    SEGMENTS_SQL,
};
use super::segment_offsets::refresh_recording_segment_offsets;
use super::types::{
    LiveCenterAnalysisJob, LiveCenterDateBoundsResponse, LiveCenterExistingUploadSegment,
    LiveCenterMinuteMetric, LiveCenterRecording, LiveCenterRecordingSegment,
    LiveCenterSessionDetailResponse, LiveCenterSessionIdentity, LiveCenterSessionItem,
    LiveCenterSessionListResponse, LiveCenterUploadInsert, NormalizedLiveCenterAnalysisCreate,
    NormalizedLiveCenterSessionQuery, NormalizedLiveCenterUploadComplete,
};

pub(super) async fn list_sessions(
    pool: &PgPool,
    query: &NormalizedLiveCenterSessionQuery,
) -> AppResult<LiveCenterSessionListResponse> {
    let offset = (query.page - 1) * query.page_size;
    let rows = sqlx::query(LIST_SESSIONS_SQL)
        .bind(query.keyword.as_deref())
        .bind(query.shop_id.as_deref())
        .bind(query.anchor_douyin_id.as_deref())
        .bind(query.start_date)
        .bind(query.end_date)
        .bind(query.page_size)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|error| map_db_error(error, "list live center sessions"))?;

    let total = rows
        .first()
        .and_then(|row| row.try_get::<i64, _>("total_count").ok())
        .unwrap_or(0);
    let items = rows.into_iter().map(map_session_row).collect();

    Ok(LiveCenterSessionListResponse {
        items,
        total,
        page: query.page,
        page_size: query.page_size,
    })
}

pub(super) async fn get_date_bounds(pool: &PgPool) -> AppResult<LiveCenterDateBoundsResponse> {
    let row = sqlx::query(DATE_BOUNDS_SQL)
        .fetch_one(pool)
        .await
        .map_err(|error| map_db_error(error, "get live center date bounds"))?;

    Ok(LiveCenterDateBoundsResponse {
        min_date: row.try_get::<Option<String>, _>("min_date").ok().flatten(),
        max_date: row.try_get::<Option<String>, _>("max_date").ok().flatten(),
    })
}

pub(super) async fn get_session_detail(
    pool: &PgPool,
    session_id: &str,
) -> AppResult<LiveCenterSessionDetailResponse> {
    let session_row = sqlx::query(DETAIL_SESSION_SQL)
        .bind(session_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| map_db_error(error, "get live center session"))?
        .ok_or(AppError::NotFound)?;
    let session = map_session_row(session_row);

    let minute_rows = sqlx::query(MINUTE_METRICS_SQL)
        .bind(session_id)
        .fetch_all(pool)
        .await
        .map_err(|error| map_db_error(error, "list live center minute metrics"))?;
    let minute_metrics = minute_rows.into_iter().map(map_minute_metric_row).collect();

    let recording = get_active_recording(pool, session_id).await?;
    let analyses = list_analysis_jobs(pool, session_id).await?;

    Ok(LiveCenterSessionDetailResponse {
        session,
        minute_metrics,
        recording,
        analyses,
    })
}

pub(super) async fn create_upload_segment(
    pool: &PgPool,
    session_id: &str,
    insert: LiveCenterUploadInsert,
) -> AppResult<(Uuid, Uuid)> {
    let identity = fetch_session_identity(pool, session_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| map_db_error(error, "begin live center upload transaction"))?;

    let recording_id = Uuid::new_v4();
    let recording_row = sqlx::query(
        r#"
        INSERT INTO ads.douyin_live_session_recordings (
          recording_id,
          session_key,
          shop_id,
          anchor_douyin_id,
          live_start_time,
          status,
          created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, 'active', $6)
        ON CONFLICT (session_key) WHERE status = 'active'
        DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING recording_id
        "#,
    )
    .bind(recording_id)
    .bind(identity.session_id.as_str())
    .bind(identity.shop_id.as_str())
    .bind(identity.anchor_douyin_id.as_str())
    .bind(identity.live_start_time)
    .bind(insert.uploaded_by_user_id.as_str())
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| map_db_error(error, "upsert live center recording"))?;
    let recording_id = match recording_row.try_get::<Uuid, _>("recording_id") {
        Ok(recording_id) => recording_id,
        Err(error) => {
            error!(?error, "decode live center recording id failed");
            return Err(AppError::Internal);
        }
    };

    if let Some(reused_segment_id) =
        recycle_failed_upload_segment(&mut transaction, recording_id, &insert).await?
    {
        transaction
            .commit()
            .await
            .map_err(|error| map_db_error(error, "commit live center upload transaction"))?;
        return Ok((recording_id, reused_segment_id));
    }

    sqlx::query(
        r#"
        INSERT INTO ads.douyin_live_session_recording_segments (
          segment_id,
          recording_id,
          segment_index,
          bucket,
          raw_object_key,
          file_name,
          mime_type,
          file_ext,
          file_size_bytes,
          sha256,
          upload_status,
          processing_status,
          uploaded_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          'uploading',
          'pending',
          $11
        )
        "#,
    )
    .bind(insert.segment_id)
    .bind(recording_id)
    .bind(insert.normalized.segment_index)
    .bind(insert.bucket.as_str())
    .bind(insert.object_key.as_str())
    .bind(insert.normalized.file_name.as_str())
    .bind(insert.normalized.content_type.as_str())
    .bind(insert.normalized.file_ext.as_str())
    .bind(insert.normalized.file_size_bytes)
    .bind(insert.normalized.sha256.as_deref())
    .bind(insert.uploaded_by_user_id.as_str())
    .execute(&mut *transaction)
    .await
    .map_err(|error| map_db_error(error, "insert live center recording segment"))?;

    transaction
        .commit()
        .await
        .map_err(|error| map_db_error(error, "commit live center upload transaction"))?;

    Ok((recording_id, insert.segment_id))
}

async fn recycle_failed_upload_segment(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    recording_id: Uuid,
    insert: &LiveCenterUploadInsert,
) -> AppResult<Option<Uuid>> {
    let row = sqlx::query(
        r#"
        UPDATE ads.douyin_live_session_recording_segments
        SET
          segment_id = $3,
          bucket = $4,
          raw_object_key = $5,
          preview_object_key = NULL,
          file_name = $6,
          mime_type = $7,
          file_ext = $8,
          file_size_bytes = $9,
          sha256 = $10,
          duration_seconds = NULL,
          start_offset_seconds = NULL,
          end_offset_seconds = NULL,
          upload_status = 'uploading',
          processing_status = 'pending',
          uploaded_by_user_id = $11,
          uploaded_at = NULL,
          multipart_upload_id = NULL,
          multipart_part_size_bytes = NULL,
          multipart_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE recording_id = $1
          AND segment_index = $2
          AND upload_status = 'failed'
        RETURNING segment_id
        "#,
    )
    .bind(recording_id)
    .bind(insert.normalized.segment_index)
    .bind(insert.segment_id)
    .bind(insert.bucket.as_str())
    .bind(insert.object_key.as_str())
    .bind(insert.normalized.file_name.as_str())
    .bind(insert.normalized.content_type.as_str())
    .bind(insert.normalized.file_ext.as_str())
    .bind(insert.normalized.file_size_bytes)
    .bind(insert.normalized.sha256.as_deref())
    .bind(insert.uploaded_by_user_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| map_db_error(error, "recycle failed live center recording segment upload"))?;

    row.map(|row| {
        row.try_get::<Uuid, _>("segment_id").map_err(|error| {
            map_db_error(error, "decode recycled live center recording segment id")
        })
    })
    .transpose()
}

pub(super) async fn get_existing_active_upload_segment(
    pool: &PgPool,
    session_id: &str,
    segment_index: i32,
) -> AppResult<Option<LiveCenterExistingUploadSegment>> {
    let row = sqlx::query(
        r#"
        SELECT
          r.recording_id,
          s.segment_id,
          s.raw_object_key,
          s.file_name,
          s.file_size_bytes,
          s.upload_status,
          s.multipart_upload_id,
          s.multipart_part_size_bytes
        FROM ads.douyin_live_session_recordings r
        JOIN ads.douyin_live_session_recording_segments s
          ON s.recording_id = r.recording_id
        WHERE r.session_key = $1
          AND r.status = 'active'
          AND s.segment_index = $2
          AND s.upload_status IN ('pending', 'uploading', 'uploaded')
        LIMIT 1
        "#,
    )
    .bind(session_id)
    .bind(segment_index)
    .fetch_optional(pool)
    .await
    .map_err(|error| map_db_error(error, "get existing live center upload segment"))?;

    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(LiveCenterExistingUploadSegment {
        recording_id: row
            .try_get::<Uuid, _>("recording_id")
            .map_err(|error| map_db_error(error, "decode live center upload recording id"))?,
        segment_id: row
            .try_get::<Uuid, _>("segment_id")
            .map_err(|error| map_db_error(error, "decode live center upload segment id"))?,
        raw_object_key: row
            .try_get::<String, _>("raw_object_key")
            .map_err(|error| map_db_error(error, "decode live center upload object key"))?,
        file_name: row
            .try_get::<String, _>("file_name")
            .map_err(|error| map_db_error(error, "decode live center upload file name"))?,
        file_size_bytes: row
            .try_get::<Option<i64>, _>("file_size_bytes")
            .map_err(|error| map_db_error(error, "decode live center upload file size"))?,
        upload_status: row
            .try_get::<String, _>("upload_status")
            .map_err(|error| map_db_error(error, "decode live center upload status"))?,
        multipart_upload_id: row
            .try_get::<Option<String>, _>("multipart_upload_id")
            .map_err(|error| map_db_error(error, "decode live center multipart upload id"))?,
        multipart_part_size_bytes: row
            .try_get::<Option<i64>, _>("multipart_part_size_bytes")
            .map_err(|error| map_db_error(error, "decode live center multipart part size"))?,
    }))
}

pub(super) async fn attach_segment_multipart_upload(
    pool: &PgPool,
    recording_id: Uuid,
    segment_id: Uuid,
    upload_id: &str,
    part_size_bytes: i64,
    expires_at: DateTime<Utc>,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.douyin_live_session_recording_segments
        SET
          multipart_upload_id = $3,
          multipart_part_size_bytes = $4,
          multipart_expires_at = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE recording_id = $1
          AND segment_id = $2
          AND upload_status = 'uploading'
        "#,
    )
    .bind(recording_id)
    .bind(segment_id)
    .bind(upload_id)
    .bind(part_size_bytes)
    .bind(expires_at)
    .execute(pool)
    .await
    .map_err(|error| map_db_error(error, "attach live center multipart upload metadata"))?;

    Ok(())
}

pub(super) async fn complete_segment_upload(
    pool: &PgPool,
    recording_id: Uuid,
    segment_id: Uuid,
    payload: &NormalizedLiveCenterUploadComplete,
) -> AppResult<LiveCenterRecordingSegment> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| map_db_error(error, "begin live center segment completion transaction"))?;

    let affected = sqlx::query(
        r#"
        UPDATE ads.douyin_live_session_recording_segments
        SET
          file_size_bytes = COALESCE($3, file_size_bytes),
          sha256 = COALESCE($4, sha256),
          duration_seconds = COALESCE(($5::DOUBLE PRECISION)::NUMERIC, duration_seconds),
          upload_status = 'uploaded',
          processing_status = 'ready',
          uploaded_at = COALESCE(uploaded_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        WHERE recording_id = $1
          AND segment_id = $2
          AND upload_status <> 'deleted'
        "#,
    )
    .bind(recording_id)
    .bind(segment_id)
    .bind(payload.file_size_bytes)
    .bind(payload.sha256.as_deref())
    .bind(payload.duration_seconds)
    .execute(&mut *transaction)
    .await
    .map_err(|error| map_db_error(error, "complete live center segment upload"))?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }

    refresh_recording_segment_offsets(&mut transaction, recording_id).await?;

    let row = sqlx::query(SEGMENT_BY_ID_SQL)
        .bind(recording_id)
        .bind(segment_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| map_db_error(error, "fetch completed live center segment upload"))?;

    transaction.commit().await.map_err(|error| {
        map_db_error(error, "commit live center segment completion transaction")
    })?;

    Ok(map_segment_row(row))
}

const SEGMENT_BY_ID_SQL: &str = r#"
SELECT
  segment_id,
  recording_id,
  segment_index,
  bucket,
  raw_object_key,
  preview_object_key,
  file_name,
  mime_type,
  file_ext,
  file_size_bytes,
  sha256,
  duration_seconds::DOUBLE PRECISION AS duration_seconds,
  start_offset_seconds::DOUBLE PRECISION AS start_offset_seconds,
  end_offset_seconds::DOUBLE PRECISION AS end_offset_seconds,
  upload_status,
  processing_status,
  uploaded_by_user_id,
  uploaded_at,
  created_at,
  updated_at
FROM ads.douyin_live_session_recording_segments
WHERE recording_id = $1
  AND segment_id = $2
  AND upload_status <> 'deleted'
"#;

pub(super) async fn create_analysis_job(
    pool: &PgPool,
    session_id: &str,
    payload: &NormalizedLiveCenterAnalysisCreate,
    created_by_user_id: &str,
) -> AppResult<LiveCenterAnalysisJob> {
    fetch_session_identity(pool, session_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let recording_row = sqlx::query(
        r#"
        SELECT
          r.recording_id,
          COUNT(s.segment_id)::BIGINT AS uploaded_segment_count
        FROM ads.douyin_live_session_recordings r
        LEFT JOIN ads.douyin_live_session_recording_segments s
          ON s.recording_id = r.recording_id
         AND s.upload_status = 'uploaded'
        WHERE r.session_key = $1
          AND r.status = 'active'
        GROUP BY r.recording_id
        ORDER BY r.updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| map_db_error(error, "get live center recording for analysis"))?
    .ok_or_else(|| AppError::bad_request("该直播尚未上传录屏，无法创建 AI 分析任务"))?;

    let uploaded_segment_count = recording_row
        .try_get::<i64, _>("uploaded_segment_count")
        .unwrap_or(0);
    if uploaded_segment_count <= 0 {
        return Err(AppError::bad_request(
            "该直播尚未完成录屏上传，无法创建 AI 分析任务",
        ));
    }

    let recording_id = match recording_row.try_get::<Uuid, _>("recording_id") {
        Ok(recording_id) => recording_id,
        Err(error) => {
            error!(?error, "decode live center analysis recording id failed");
            return Err(AppError::Internal);
        }
    };
    let analysis_id = Uuid::new_v4();
    let row = sqlx::query(
        r#"
        INSERT INTO ads.douyin_live_session_analysis (
          analysis_id,
          session_key,
          recording_id,
          status,
          model,
          analysis_profile,
          prompt_version,
          input_snapshot,
          progress_percent,
          processing_stage,
          analysis_json,
          created_by_user_id
        )
        VALUES ($1, $2, $3, 'queued', $4, $5, $6, '{}'::JSONB, 0, 'queued', '{}'::JSONB, $7)
        RETURNING
          analysis_id,
          session_key,
          recording_id,
          status,
          model,
          analysis_profile,
          provider,
          prompt_version,
          input_snapshot,
          progress_percent,
          processing_stage,
          output_object_key,
          response_id,
          usage_json,
          analysis_json,
          error_message,
          created_by_user_id,
          created_at,
          started_at,
          completed_at,
          updated_at
        "#,
    )
    .bind(analysis_id)
    .bind(session_id)
    .bind(recording_id)
    .bind(payload.model.as_str())
    .bind(payload.analysis_profile.as_str())
    .bind(payload.prompt_version.as_str())
    .bind(created_by_user_id)
    .fetch_one(pool)
    .await
    .map_err(|error| map_db_error(error, "create live center analysis job"))?;

    map_analysis_row(row)
}

async fn fetch_session_identity(
    pool: &PgPool,
    session_id: &str,
) -> AppResult<Option<LiveCenterSessionIdentity>> {
    let row = sqlx::query(
        r#"
        SELECT
          session_id,
          shop_id,
          anchor_douyin_id,
          live_start_time
        FROM (
          SELECT DISTINCT ON (session_id)
            md5(
              COALESCE(NULLIF(BTRIM(d.shop_id), ''), '')
              || '|'
              || COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '')
              || '|'
              || (
                CASE
                  WHEN d.live_end_time IS NOT NULL AND d.live_end_time > d.live_start_time
                    THEN DATE_TRUNC('minute', d.live_end_time)
                  ELSE DATE_TRUNC('minute', d.live_start_time)
                END
              )::TEXT
            ) AS session_id,
            COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
            COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
            d.live_start_time,
            d.source_updated_at,
            d.updated_at
          FROM ads.douyin_live_detail d
          WHERE d.live_start_time IS NOT NULL
            AND NULLIF(BTRIM(COALESCE(d.anchor_douyin_id, '')), '') IS NOT NULL
            AND COALESCE(d.is_self_live, FALSE) IS TRUE
            AND LOWER(COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '')) LIKE 'groland%'
          ORDER BY session_id, source_updated_at DESC NULLS LAST, updated_at DESC NULLS LAST, live_start_time DESC
        ) s
        WHERE s.session_id = $1
        "#,
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| map_db_error(error, "get live center session identity"))?;

    Ok(row.map(|row| LiveCenterSessionIdentity {
        session_id: row.try_get::<String, _>("session_id").unwrap_or_default(),
        shop_id: row.try_get::<String, _>("shop_id").unwrap_or_default(),
        anchor_douyin_id: row
            .try_get::<String, _>("anchor_douyin_id")
            .unwrap_or_default(),
        live_start_time: row
            .try_get::<NaiveDateTime, _>("live_start_time")
            .unwrap_or_else(|_| Utc::now().naive_utc()),
    }))
}

async fn get_active_recording(
    pool: &PgPool,
    session_id: &str,
) -> AppResult<Option<LiveCenterRecording>> {
    let recording_row = sqlx::query(
        r#"
        SELECT
          recording_id,
          session_key,
          status,
          created_at,
          updated_at
        FROM ads.douyin_live_session_recordings
        WHERE session_key = $1
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| map_db_error(error, "get active live center recording"))?;

    let Some(recording_row) = recording_row else {
        return Ok(None);
    };

    let recording_id = match recording_row.try_get::<Uuid, _>("recording_id") {
        Ok(recording_id) => recording_id,
        Err(error) => {
            error!(?error, "decode active live center recording id failed");
            return Err(AppError::Internal);
        }
    };
    let segment_rows = sqlx::query(SEGMENTS_SQL)
        .bind(recording_id)
        .fetch_all(pool)
        .await
        .map_err(|error| map_db_error(error, "list live center recording segments"))?;

    Ok(Some(LiveCenterRecording {
        recording_id,
        session_id: recording_row
            .try_get::<String, _>("session_key")
            .unwrap_or_default(),
        status: recording_row
            .try_get::<String, _>("status")
            .unwrap_or_else(|_| "active".to_string()),
        created_at: read_required_timestamp(&recording_row, "created_at"),
        updated_at: read_required_timestamp(&recording_row, "updated_at"),
        segments: segment_rows.into_iter().map(map_segment_row).collect(),
    }))
}

async fn list_analysis_jobs(
    pool: &PgPool,
    session_id: &str,
) -> AppResult<Vec<LiveCenterAnalysisJob>> {
    let rows = sqlx::query(ANALYSIS_SQL)
        .bind(session_id)
        .fetch_all(pool)
        .await
        .map_err(|error| map_db_error(error, "list live center analysis jobs"))?;
    rows.into_iter().map(map_analysis_row).collect()
}

fn map_session_row(row: PgRow) -> LiveCenterSessionItem {
    LiveCenterSessionItem {
        session_id: row.try_get::<String, _>("session_id").unwrap_or_default(),
        shop_id: row.try_get::<String, _>("shop_id").unwrap_or_default(),
        shop_name: row.try_get::<String, _>("shop_name").unwrap_or_default(),
        anchor_douyin_id: row
            .try_get::<String, _>("anchor_douyin_id")
            .unwrap_or_default(),
        anchor_nickname: row
            .try_get::<String, _>("anchor_nickname")
            .unwrap_or_default(),
        anchor_avatar: row
            .try_get::<Option<String>, _>("anchor_avatar")
            .ok()
            .flatten(),
        live_start_time: read_required_business_timestamp(&row, "live_start_time"),
        live_end_time: read_optional_business_timestamp(&row, "live_end_time"),
        live_duration_minutes: row
            .try_get::<Option<i64>, _>("live_duration_minutes")
            .unwrap_or(None)
            .unwrap_or(0),
        live_order_count: row
            .try_get::<Option<i64>, _>("live_order_count")
            .unwrap_or(None)
            .unwrap_or(0),
        live_gmv: row
            .try_get::<Option<f64>, _>("live_gmv")
            .unwrap_or(None)
            .unwrap_or(0.0),
        live_user_pay_amount: row
            .try_get::<Option<f64>, _>("live_user_pay_amount")
            .unwrap_or(None)
            .unwrap_or(0.0),
        minute_order_count: row
            .try_get::<Option<i64>, _>("minute_order_count")
            .unwrap_or(None)
            .unwrap_or(0),
        minute_point_count: row
            .try_get::<Option<i64>, _>("minute_point_count")
            .unwrap_or(None)
            .unwrap_or(0),
        recording_segment_count: row
            .try_get::<Option<i64>, _>("recording_segment_count")
            .unwrap_or(None)
            .unwrap_or(0),
        analysis_status: row
            .try_get::<Option<String>, _>("analysis_status")
            .ok()
            .flatten(),
    }
}

fn map_minute_metric_row(row: PgRow) -> LiveCenterMinuteMetric {
    LiveCenterMinuteMetric {
        live_minute_time: read_required_business_timestamp(&row, "live_minute_time"),
        minute_offset: row.try_get::<i32, _>("minute_offset").unwrap_or(0),
        order_count: row.try_get::<i64, _>("order_count").unwrap_or(0),
        match_status: row
            .try_get::<String, _>("match_status")
            .unwrap_or_else(|_| "matched".to_string()),
        match_reason: row
            .try_get::<Option<String>, _>("match_reason")
            .ok()
            .flatten(),
    }
}

fn map_segment_row(row: PgRow) -> LiveCenterRecordingSegment {
    LiveCenterRecordingSegment {
        segment_id: row
            .try_get::<Uuid, _>("segment_id")
            .unwrap_or_else(|_| Uuid::nil()),
        recording_id: row
            .try_get::<Uuid, _>("recording_id")
            .unwrap_or_else(|_| Uuid::nil()),
        segment_index: row.try_get::<i32, _>("segment_index").unwrap_or(0),
        bucket: row.try_get::<String, _>("bucket").unwrap_or_default(),
        raw_object_key: row
            .try_get::<String, _>("raw_object_key")
            .unwrap_or_default(),
        preview_object_key: row
            .try_get::<Option<String>, _>("preview_object_key")
            .ok()
            .flatten(),
        file_name: row.try_get::<String, _>("file_name").unwrap_or_default(),
        mime_type: row.try_get::<Option<String>, _>("mime_type").ok().flatten(),
        file_ext: row.try_get::<Option<String>, _>("file_ext").ok().flatten(),
        file_size_bytes: row
            .try_get::<Option<i64>, _>("file_size_bytes")
            .ok()
            .flatten(),
        sha256: row.try_get::<Option<String>, _>("sha256").ok().flatten(),
        duration_seconds: row
            .try_get::<Option<f64>, _>("duration_seconds")
            .ok()
            .flatten(),
        start_offset_seconds: row
            .try_get::<Option<f64>, _>("start_offset_seconds")
            .ok()
            .flatten(),
        end_offset_seconds: row
            .try_get::<Option<f64>, _>("end_offset_seconds")
            .ok()
            .flatten(),
        upload_status: row
            .try_get::<String, _>("upload_status")
            .unwrap_or_else(|_| "pending".to_string()),
        processing_status: row
            .try_get::<String, _>("processing_status")
            .unwrap_or_else(|_| "pending".to_string()),
        uploaded_by_user_id: row
            .try_get::<Option<String>, _>("uploaded_by_user_id")
            .ok()
            .flatten(),
        uploaded_at: read_optional_timestamp(&row, "uploaded_at"),
        created_at: read_required_timestamp(&row, "created_at"),
        updated_at: read_required_timestamp(&row, "updated_at"),
    }
}

fn map_analysis_row(row: PgRow) -> AppResult<LiveCenterAnalysisJob> {
    let analysis_id = row.try_get::<Uuid, _>("analysis_id").map_err(|error| {
        error!(?error, "decode live center analysis id failed");
        AppError::Internal
    })?;

    Ok(LiveCenterAnalysisJob {
        analysis_id,
        session_id: row.try_get::<String, _>("session_key").unwrap_or_default(),
        recording_id: row
            .try_get::<Option<Uuid>, _>("recording_id")
            .ok()
            .flatten(),
        status: row
            .try_get::<String, _>("status")
            .unwrap_or_else(|_| "queued".to_string()),
        model: row.try_get::<Option<String>, _>("model").ok().flatten(),
        analysis_profile: row
            .try_get::<Option<String>, _>("analysis_profile")
            .ok()
            .flatten(),
        provider: row.try_get::<Option<String>, _>("provider").ok().flatten(),
        prompt_version: row
            .try_get::<Option<String>, _>("prompt_version")
            .ok()
            .flatten(),
        input_snapshot: row
            .try_get::<Value, _>("input_snapshot")
            .unwrap_or_else(|_| serde_json::json!({})),
        progress_percent: row.try_get::<i32, _>("progress_percent").unwrap_or(0),
        processing_stage: row
            .try_get::<Option<String>, _>("processing_stage")
            .ok()
            .flatten(),
        output_object_key: row
            .try_get::<Option<String>, _>("output_object_key")
            .ok()
            .flatten(),
        response_id: row
            .try_get::<Option<String>, _>("response_id")
            .ok()
            .flatten(),
        usage_json: row
            .try_get::<Value, _>("usage_json")
            .unwrap_or_else(|_| serde_json::json!({})),
        analysis_json: row
            .try_get::<Value, _>("analysis_json")
            .unwrap_or_else(|_| serde_json::json!({})),
        error_message: row
            .try_get::<Option<String>, _>("error_message")
            .ok()
            .flatten(),
        created_by_user_id: row
            .try_get::<Option<String>, _>("created_by_user_id")
            .ok()
            .flatten(),
        created_at: read_required_timestamp(&row, "created_at"),
        started_at: read_optional_timestamp(&row, "started_at"),
        completed_at: read_optional_timestamp(&row, "completed_at"),
        updated_at: read_required_timestamp(&row, "updated_at"),
    })
}

fn read_required_timestamp(row: &PgRow, column: &str) -> String {
    if let Some(value) = read_optional_timestamp(row, column) {
        return value;
    }

    error!(column, "decode live center required timestamp failed");
    Utc::now().to_rfc3339()
}

fn read_required_business_timestamp(row: &PgRow, column: &str) -> String {
    if let Some(value) = read_optional_business_timestamp(row, column) {
        return value;
    }

    error!(
        column,
        "decode live center required business timestamp failed"
    );
    format_business_timestamp(Utc::now().naive_utc())
}

fn read_optional_timestamp(row: &PgRow, column: &str) -> Option<String> {
    if let Ok(value) = row.try_get::<Option<DateTime<Utc>>, _>(column) {
        return value.map(|value| value.to_rfc3339());
    }
    if let Ok(value) = row.try_get::<Option<NaiveDateTime>, _>(column) {
        return value.map(|value| value.and_utc().to_rfc3339());
    }
    None
}

fn read_optional_business_timestamp(row: &PgRow, column: &str) -> Option<String> {
    if let Ok(value) = row.try_get::<Option<NaiveDateTime>, _>(column) {
        return value.map(format_business_timestamp);
    }
    if let Ok(value) = row.try_get::<Option<DateTime<Utc>>, _>(column) {
        return value.map(|value| format_business_timestamp(value.naive_utc()));
    }
    None
}

fn format_business_timestamp(value: NaiveDateTime) -> String {
    value.format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn map_db_error(error: sqlx::Error, context: &str) -> AppError {
    if let sqlx::Error::Database(database_error) = &error {
        match database_error.code().as_deref() {
            Some("23505") => {
                return AppError::Conflict(
                    "直播录屏分段已存在，请刷新后选择新的分段序号".to_string(),
                )
            }
            Some("23503") => return AppError::bad_request("直播录屏引用的场次或录屏不存在"),
            _ => {}
        }
    }

    if matches!(error, sqlx::Error::RowNotFound) {
        return AppError::NotFound;
    }

    error!(?error, context, "live center database operation failed");
    AppError::Internal
}
