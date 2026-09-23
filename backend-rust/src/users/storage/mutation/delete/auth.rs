use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::{
    errors::{is_undefined_column, is_undefined_table},
    types::UserStorage,
};

pub(super) async fn soft_delete_auth_user(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
) -> AppResult<bool> {
    let soft_delete_result = sqlx::query(
        r#"
        UPDATE auth_users
        SET
            is_active = FALSE,
            is_deleted = TRUE
        WHERE CAST(id AS TEXT) = $1
          AND COALESCE(is_deleted, FALSE) = FALSE
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await;

    match soft_delete_result {
        Ok(result) => Ok(result.rows_affected() > 0),
        Err(error) if is_undefined_column(&error) => {
            hard_delete_auth_user_without_is_deleted(pool, user_id).await
        }
        Err(error) => {
            error!(?error, ?storage, user_id = user_id, "delete user failed");
            Err(AppError::Internal)
        }
    }
}

async fn hard_delete_auth_user_without_is_deleted(pool: &PgPool, user_id: &str) -> AppResult<bool> {
    let mut tx = pool.begin().await.map_err(|tx_error| {
        error!(
            ?tx_error,
            user_id = user_id,
            "begin tx for auth user delete fallback failed"
        );
        AppError::Internal
    })?;

    let clear_roles_result = sqlx::query(
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
    .await;

    if let Err(clear_roles_error) = clear_roles_result {
        if !is_undefined_table(&clear_roles_error) {
            error!(
                ?clear_roles_error,
                user_id = user_id,
                "clear auth user roles failed before delete fallback"
            );
            return Err(AppError::Internal);
        }
    }

    let delete_result = sqlx::query(
        r#"
        DELETE FROM auth_users
        WHERE CAST(id AS TEXT) = $1
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|delete_error| {
        error!(
            ?delete_error,
            user_id = user_id,
            "hard delete auth user fallback failed"
        );
        AppError::Internal
    })?;

    tx.commit().await.map_err(|commit_error| {
        error!(
            ?commit_error,
            user_id = user_id,
            "commit auth user delete fallback tx failed"
        );
        AppError::Internal
    })?;

    Ok(delete_result.rows_affected() > 0)
}
