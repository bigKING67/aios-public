use sqlx::PgPool;
use tracing::{error, warn};

use crate::error::{AppError, AppResult};

use super::statements::WEEKLY_SUMMARY_STORAGE_BOOTSTRAP_STATEMENTS;

pub(super) async fn bootstrap_weekly_summary_storage(pool: &PgPool) -> AppResult<()> {
    ensure_ads_schema_exists(pool).await?;

    if is_storage_bootstrapped(pool).await {
        return Ok(());
    }

    for statement in WEEKLY_SUMMARY_STORAGE_BOOTSTRAP_STATEMENTS {
        sqlx::query(statement).execute(pool).await.map_err(|error| {
            error!(?error, "initialize weekly summary storage failed");
            AppError::bad_request(
                "周报总结表尚未初始化，请执行 sql/migrations/010_weekly_summary_scope_hardening.sql 后重试。",
            )
        })?;
    }

    Ok(())
}

async fn ensure_ads_schema_exists(pool: &PgPool) -> AppResult<()> {
    let schema_exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.schemata
            WHERE schema_name = 'ads'
        )
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "check ads schema failed");
        AppError::Internal
    })?;

    if !schema_exists {
        return Err(AppError::bad_request(
            "数据库缺少 ads schema，无法启用周报总结功能。请先完成数据库初始化后重试。",
        ));
    }

    Ok(())
}

async fn is_storage_bootstrapped(pool: &PgPool) -> bool {
    let storage_bootstrapped_query = sqlx::query_scalar::<_, bool>(
        r#"
        WITH required_columns AS (
            SELECT unnest(ARRAY[
                'id',
                'week_period',
                'summary_text',
                'status',
                'generated_at',
                'error_msg',
                'task_id',
                'provider',
                'model',
                'prompt_config',
                'facts_snapshot',
                'attempt_count',
                'requested_by',
                'created_at',
                'updated_at',
                'summary_scope',
                'summary_content_status',
                'summary_updated_by',
                'summary_approved_by',
                'summary_approved_at',
                'summary_published_by',
                'summary_published_at'
            ]::text[]) AS column_name
        ),
        existing_columns AS (
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'ads'
              AND table_name = 'report_weekly_summary'
        ),
        column_ready AS (
            SELECT
                COUNT(*) = (SELECT COUNT(*) FROM required_columns) AS ready
            FROM required_columns required
            JOIN existing_columns existing ON existing.column_name = required.column_name
        ),
        index_status AS (
            SELECT
                EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE schemaname = 'ads'
                      AND tablename = 'report_weekly_summary'
                      AND indexname = 'uq_report_weekly_summary_week_period_scope'
                ) AS has_scope_unique,
                EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE schemaname = 'ads'
                      AND tablename = 'report_weekly_summary'
                      AND indexname = 'uq_report_weekly_summary_week_period'
                ) AS has_legacy_week_unique,
                EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE connamespace = 'ads'::regnamespace
                      AND conrelid = 'ads.report_weekly_summary'::regclass
                      AND conname = 'uq_report_weekly_summary_week_period'
                ) AS has_legacy_week_unique_constraint
        )
        SELECT
            COALESCE((SELECT ready FROM column_ready), false)
            AND COALESCE((SELECT has_scope_unique FROM index_status), false)
            AND NOT COALESCE((SELECT has_legacy_week_unique FROM index_status), false)
            AND NOT COALESCE((SELECT has_legacy_week_unique_constraint FROM index_status), false)
        "#,
    );

    match storage_bootstrapped_query.fetch_one(pool).await {
        Ok(value) => value,
        Err(error) => {
            warn!(
                ?error,
                "check weekly summary storage bootstrap state failed, fallback to bootstrap statements"
            );
            false
        }
    }
}
