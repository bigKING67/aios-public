use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

pub(super) async fn replace_auth_role_permissions(
    pool: &PgPool,
    role_id: &str,
    permission_ids: &[i64],
) -> AppResult<()> {
    let mut tx = pool.begin().await.map_err(|error| {
        error!(?error, "begin tx for replace auth role permissions failed");
        AppError::Internal
    })?;

    sqlx::query(
        r#"
        DELETE FROM auth_role_permissions
        WHERE role_id = (
            SELECT id
            FROM auth_roles
            WHERE CAST(id AS TEXT) = $1
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
            "clear auth role permissions failed"
        );
        AppError::Internal
    })?;

    if !permission_ids.is_empty() {
        sqlx::query(
            r#"
            WITH selected_permissions AS (
                SELECT mapped.permission_id
                FROM (
                    SELECT
                        p.id AS permission_id,
                        ROW_NUMBER() OVER (ORDER BY p.key)::BIGINT AS synthetic_id
                    FROM auth_permissions p
                ) mapped
                WHERE mapped.synthetic_id = ANY($2)
            )
            INSERT INTO auth_role_permissions (role_id, permission_id)
            SELECT r.id, sp.permission_id
            FROM auth_roles r
            JOIN selected_permissions sp ON TRUE
            WHERE CAST(r.id AS TEXT) = $1
            ON CONFLICT (role_id, permission_id) DO NOTHING
            "#,
        )
        .bind(role_id)
        .bind(permission_ids)
        .execute(&mut *tx)
        .await
        .map_err(|error| {
            error!(
                ?error,
                role_id = role_id,
                "insert auth role permissions failed"
            );
            AppError::Internal
        })?;
    }

    tx.commit().await.map_err(|error| {
        error!(
            ?error,
            role_id = role_id,
            "commit auth role permissions tx failed"
        );
        AppError::Internal
    })
}
