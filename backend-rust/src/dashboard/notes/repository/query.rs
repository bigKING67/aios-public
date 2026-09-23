use std::collections::BTreeMap;

use sqlx::{PgPool, Row};

use super::super::model::{note_entity_from_row, DashboardDailyNoteRow};

pub(in crate::dashboard::notes) async fn fetch_note_counts_by_date(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    platform: &str,
) -> Result<BTreeMap<String, i64>, String> {
    let rows = sqlx::query(
        r#"
        SELECT
          note_date::TEXT AS note_date,
          COUNT(*) AS total_count
        FROM public.dashboard_daily_notes
        WHERE deleted_at IS NULL
          AND note_date BETWEEN $1::DATE AND $2::DATE
          AND ($3::TEXT = 'overview' OR platform = $3::TEXT)
        GROUP BY note_date
        ORDER BY note_date
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .bind(platform)
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())?;

    let mut counts_by_date = BTreeMap::<String, i64>::new();
    for row in rows {
        let note_date = row
            .try_get::<String, _>("note_date")
            .map_err(|error| error.to_string())?;
        let total_count = row
            .try_get::<i64, _>("total_count")
            .map_err(|error| error.to_string())?;
        counts_by_date.insert(note_date, total_count);
    }

    Ok(counts_by_date)
}

pub(in crate::dashboard::notes) async fn list_note_entities(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    platform: &str,
    note_date: Option<&str>,
) -> Result<Vec<DashboardDailyNoteRow>, String> {
    let rows = sqlx::query(
        r#"
        SELECT
          id,
          note_date::TEXT AS note_date,
          platform,
          metric_key,
          action_text,
          reason_text,
          summary_text,
          created_by,
          updated_by,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        FROM public.dashboard_daily_notes
        WHERE deleted_at IS NULL
          AND note_date BETWEEN $1::DATE AND $2::DATE
          AND ($3::TEXT = 'overview' OR platform = $3::TEXT)
          AND ($4::DATE IS NULL OR note_date = $4::DATE)
        ORDER BY note_date ASC, platform ASC, id ASC
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .bind(platform)
    .bind(note_date)
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())?;

    rows.iter().map(note_entity_from_row).collect()
}

pub(in crate::dashboard::notes) async fn fetch_note_by_id(
    pool: &PgPool,
    note_id: i64,
) -> Result<Option<DashboardDailyNoteRow>, String> {
    let rows = sqlx::query(
        r#"
        SELECT
          id,
          note_date::TEXT AS note_date,
          platform,
          metric_key,
          action_text,
          reason_text,
          summary_text,
          created_by,
          updated_by,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        FROM public.dashboard_daily_notes
        WHERE id = $1::BIGINT
          AND deleted_at IS NULL
        LIMIT 1
        "#,
    )
    .bind(note_id)
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())?;

    rows.first().map(note_entity_from_row).transpose()
}
