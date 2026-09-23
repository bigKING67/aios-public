use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

pub(super) async fn replace_auth_user_roles(
    pool: &PgPool,
    user_id: &str,
    role_ids: &[String],
) -> AppResult<()> {
    let mut tx = pool.begin().await.map_err(|error| {
        error!(?error, "begin tx for replace auth user roles failed");
        AppError::Internal
    })?;

    sqlx::query(
        r#"
        DELETE FROM auth_user_roles
        WHERE user_id = (
            SELECT id
            FROM auth_users
            WHERE CAST(id AS TEXT) = $1
            LIMIT 1
        )
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| {
        error!(?error, user_id = user_id, "clear auth user roles failed");
        AppError::Internal
    })?;

    if !role_ids.is_empty() {
        sqlx::query(
            r#"
            INSERT INTO auth_user_roles (user_id, role_id)
            SELECT u.id, r.id
            FROM auth_users u
            JOIN auth_roles r ON CAST(r.id AS TEXT) = ANY($2)
            WHERE CAST(u.id AS TEXT) = $1
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(user_id)
        .bind(role_ids)
        .execute(&mut *tx)
        .await
        .map_err(|error| {
            error!(?error, user_id = user_id, "insert auth user roles failed");
            AppError::Internal
        })?;
    }

    tx.commit().await.map_err(|error| {
        error!(
            ?error,
            user_id = user_id,
            "commit auth user roles tx failed"
        );
        AppError::Internal
    })?;

    Ok(())
}
