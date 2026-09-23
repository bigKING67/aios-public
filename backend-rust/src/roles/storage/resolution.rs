use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::types::RoleStorage;

pub(crate) async fn resolve_role_storage(pool: &PgPool) -> AppResult<Option<RoleStorage>> {
    let row = sqlx::query(
        r#"
        SELECT CASE
            WHEN to_regclass('public.auth_roles') IS NOT NULL THEN 'auth'
            WHEN to_regclass('public.roles') IS NOT NULL THEN 'legacy'
            WHEN to_regclass('public.ods_aios_roles') IS NOT NULL THEN 'ods'
            ELSE NULL
        END AS storage
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "resolve role storage failed");
        AppError::Internal
    })?;

    let storage = row.try_get::<Option<String>, _>("storage").ok().flatten();
    Ok(match storage.as_deref() {
        Some("auth") => Some(RoleStorage::Auth),
        Some("legacy") => Some(RoleStorage::Legacy),
        Some("ods") => Some(RoleStorage::Ods),
        _ => None,
    })
}
