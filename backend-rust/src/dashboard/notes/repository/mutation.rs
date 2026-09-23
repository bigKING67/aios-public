use sqlx::PgPool;

use super::super::model::{note_entity_from_row, DashboardDailyNoteRow};
use super::inputs::{CreateNoteInput, UpdateNoteInput};

pub(in crate::dashboard::notes) async fn insert_note(
    pool: &PgPool,
    input: CreateNoteInput<'_>,
) -> Result<Option<DashboardDailyNoteRow>, String> {
    let rows = sqlx::query(
        r#"
        INSERT INTO public.dashboard_daily_notes (
          note_date,
          platform,
          metric_key,
          action_text,
          reason_text,
          summary_text,
          created_by,
          updated_by
        )
        VALUES (
          $1::DATE,
          $2::TEXT,
          $3::TEXT,
          $4::TEXT,
          $5::TEXT,
          $6::TEXT,
          $7::TEXT,
          $7::TEXT
        )
        RETURNING
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
        "#,
    )
    .bind(input.note_date)
    .bind(input.platform)
    .bind(input.metric_key)
    .bind(input.action_text)
    .bind(input.reason_text)
    .bind(input.summary_text)
    .bind(input.actor_id)
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())?;

    rows.first().map(note_entity_from_row).transpose()
}

pub(in crate::dashboard::notes) async fn update_note_entity(
    pool: &PgPool,
    input: UpdateNoteInput<'_>,
) -> Result<Option<DashboardDailyNoteRow>, String> {
    let rows = sqlx::query(
        r#"
        UPDATE public.dashboard_daily_notes
        SET
          metric_key = $2::TEXT,
          action_text = $3::TEXT,
          reason_text = $4::TEXT,
          summary_text = $5::TEXT,
          updated_by = $6::TEXT,
          updated_at = NOW()
        WHERE id = $1::BIGINT
          AND deleted_at IS NULL
        RETURNING
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
        "#,
    )
    .bind(input.note_id)
    .bind(input.metric_key)
    .bind(input.action_text)
    .bind(input.reason_text)
    .bind(input.summary_text)
    .bind(input.actor_id)
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())?;

    rows.first().map(note_entity_from_row).transpose()
}

pub(in crate::dashboard::notes) async fn soft_delete_note(
    pool: &PgPool,
    note_id: i64,
    actor_id: &str,
) -> Result<u64, String> {
    sqlx::query(
        r#"
        UPDATE public.dashboard_daily_notes
        SET
          deleted_at = NOW(),
          updated_by = $2::TEXT,
          updated_at = NOW()
        WHERE id = $1::BIGINT
          AND deleted_at IS NULL
        "#,
    )
    .bind(note_id)
    .bind(actor_id)
    .execute(pool)
    .await
    .map(|result| result.rows_affected())
    .map_err(|error| error.to_string())
}
