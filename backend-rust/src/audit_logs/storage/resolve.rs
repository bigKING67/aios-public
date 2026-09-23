use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::types::AuditStorage;

pub(in crate::audit_logs) async fn resolve_audit_storage(
    pool: &PgPool,
) -> AppResult<Option<AuditStorage>> {
    let row = sqlx::query(
        r#"
        SELECT CASE
            WHEN to_regclass('public.audit_logs') IS NOT NULL THEN 'legacy'
            WHEN to_regclass('public.ods_aios_audit_logs') IS NOT NULL THEN 'ods'
            ELSE NULL
        END AS storage
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "resolve audit storage failed");
        AppError::Internal
    })?;

    let storage = row.try_get::<Option<String>, _>("storage").ok().flatten();
    Ok(match storage.as_deref() {
        Some("legacy") => Some(AuditStorage::Legacy),
        Some("ods") => Some(AuditStorage::Ods),
        _ => None,
    })
}
