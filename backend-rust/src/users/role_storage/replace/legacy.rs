use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

pub(super) async fn replace_legacy_user_roles(
    pool: &PgPool,
    user_id: &str,
    role_ids: &[String],
    actor_user_id: Option<i64>,
) -> AppResult<()> {
    let mut tx = pool.begin().await.map_err(|error| {
        error!(?error, "begin tx for replace legacy user roles failed");
        AppError::Internal
    })?;

    sqlx::query(
        r#"
        DELETE FROM user_roles
        WHERE user_id = (
            SELECT id
            FROM users
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
            LIMIT 1
        )
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| {
        error!(?error, user_id = user_id, "clear legacy user roles failed");
        AppError::Internal
    })?;

    if !role_ids.is_empty() {
        sqlx::query(
            r#"
            INSERT INTO user_roles (user_id, role_id, created_by)
            SELECT u.id, r.id, $2
            FROM users u
            JOIN roles r ON CAST(r.id AS TEXT) = ANY($3)
            WHERE CAST(u.id AS TEXT) = $1
              AND COALESCE(u.is_deleted, FALSE) = FALSE
              AND COALESCE(r.is_deleted, FALSE) = FALSE
              AND COALESCE(r.is_active, TRUE) = TRUE
            ON CONFLICT (user_id, role_id) DO NOTHING
            "#,
        )
        .bind(user_id)
        .bind(actor_user_id)
        .bind(role_ids)
        .execute(&mut *tx)
        .await
        .map_err(|error| {
            error!(?error, user_id = user_id, "insert legacy user roles failed");
            AppError::Internal
        })?;
    }

    tx.commit().await.map_err(|error| {
        error!(
            ?error,
            user_id = user_id,
            "commit legacy user roles tx failed"
        );
        AppError::Internal
    })?;

    Ok(())
}
