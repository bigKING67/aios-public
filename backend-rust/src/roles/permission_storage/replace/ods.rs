use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

pub(super) async fn replace_ods_role_permissions(
    pool: &PgPool,
    role_id: &str,
    permission_ids: &[i64],
    actor_user_id: Option<i64>,
) -> AppResult<()> {
    let mut tx = pool.begin().await.map_err(|error| {
        error!(?error, "begin tx for replace ods role permissions failed");
        AppError::Internal
    })?;

    sqlx::query(
        r#"
        DELETE FROM ods_aios_role_permissions
        WHERE role_id = (
            SELECT id FROM ods_aios_roles
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
            LIMIT 1
        )
        "#,
    )
    .bind(role_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| {
        error!(
            ?error,
            role_id = role_id,
            "clear ods role permissions failed"
        );
        AppError::Internal
    })?;

    if !permission_ids.is_empty() {
        sqlx::query(
            r#"
            INSERT INTO ods_aios_role_permissions (role_id, permission_id, created_by)
            SELECT r.id, p.id, $2
            FROM ods_aios_roles r
            JOIN ods_aios_permissions p ON p.id = ANY($3)
            WHERE CAST(r.id AS TEXT) = $1
              AND COALESCE(r.is_deleted, FALSE) = FALSE
              AND COALESCE(p.is_deleted, FALSE) = FALSE
            ON CONFLICT (role_id, permission_id) DO NOTHING
            "#,
        )
        .bind(role_id)
        .bind(actor_user_id)
        .bind(permission_ids)
        .execute(&mut *tx)
        .await
        .map_err(|error| {
            error!(
                ?error,
                role_id = role_id,
                "insert ods role permissions failed"
            );
            AppError::Internal
        })?;
    }

    tx.commit().await.map_err(|error| {
        error!(
            ?error,
            role_id = role_id,
            "commit ods role permissions tx failed"
        );
        AppError::Internal
    })
}
