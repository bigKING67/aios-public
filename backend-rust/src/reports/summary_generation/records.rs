use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::{
    periods::normalize_week_period_for_db, summary_storage::is_undefined_table,
    WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT,
};
use super::{scope::normalize_weekly_summary_scope, types::WeeklySummaryRecord};

pub(crate) async fn query_weekly_summary_record(
    pool: &PgPool,
    week_period: &str,
    summary_scope: &str,
) -> AppResult<Option<WeeklySummaryRecord>> {
    let normalized = normalize_week_period_for_db(week_period);
    let normalized_scope = normalize_weekly_summary_scope(Some(summary_scope));

    let row = sqlx::query(
        r#"
        SELECT
            summary_text,
            status,
            summary_content_status,
            generated_at,
            error_msg,
            task_id,
            provider,
            model,
            summary_updated_by,
            summary_approved_by,
            summary_approved_at,
            summary_published_by,
            summary_published_at,
            attempt_count
        FROM ads.report_weekly_summary
        WHERE regexp_replace(replace(week_period, '~', '～'), '\s+', '', 'g') = $1
          AND lower(coalesce(summary_scope, 'global')) = $2
        ORDER BY
          (week_period = $1) DESC,
          CASE upper(status)
            WHEN 'SUCCESS' THEN 4
            WHEN 'GENERATING' THEN 3
            WHEN 'PENDING' THEN 2
            WHEN 'FAILED' THEN 1
            ELSE 0
          END DESC,
          updated_at DESC NULLS LAST,
          id DESC
        LIMIT 1
        "#,
    )
    .bind(normalized)
    .bind(normalized_scope)
    .fetch_optional(pool)
    .await;

    let row = match row {
        Ok(value) => value,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query weekly summary record failed");
            return Err(AppError::Internal);
        }
    };

    Ok(row.map(|row| WeeklySummaryRecord {
        summary_text: row
            .try_get::<Option<String>, _>("summary_text")
            .ok()
            .flatten(),
        status: row
            .try_get::<String, _>("status")
            .unwrap_or_else(|_| "PENDING".to_string()),
        content_status: row
            .try_get::<String, _>("summary_content_status")
            .unwrap_or_else(|_| WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT.to_string()),
        generated_at: row
            .try_get::<Option<DateTime<Utc>>, _>("generated_at")
            .ok()
            .flatten(),
        error_msg: row.try_get::<Option<String>, _>("error_msg").ok().flatten(),
        task_id: row.try_get::<Option<String>, _>("task_id").ok().flatten(),
        provider: row.try_get::<Option<String>, _>("provider").ok().flatten(),
        model: row.try_get::<Option<String>, _>("model").ok().flatten(),
        updated_by: row
            .try_get::<Option<String>, _>("summary_updated_by")
            .ok()
            .flatten(),
        approved_by: row
            .try_get::<Option<String>, _>("summary_approved_by")
            .ok()
            .flatten(),
        approved_at: row
            .try_get::<Option<DateTime<Utc>>, _>("summary_approved_at")
            .ok()
            .flatten(),
        published_by: row
            .try_get::<Option<String>, _>("summary_published_by")
            .ok()
            .flatten(),
        published_at: row
            .try_get::<Option<DateTime<Utc>>, _>("summary_published_at")
            .ok()
            .flatten(),
        attempt_count: row.try_get::<i32, _>("attempt_count").unwrap_or(0),
    }))
}
