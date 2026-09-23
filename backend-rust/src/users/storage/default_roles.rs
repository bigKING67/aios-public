use sqlx::PgPool;
use tracing::{error, warn};

use crate::error::{AppError, AppResult};

use super::super::constants::DEFAULT_ROLE_CANDIDATES;
use super::{
    errors::{is_undefined_column, is_undefined_table},
    types::UserStorage,
};

pub(crate) async fn assign_default_role(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
    actor_user_id: Option<i64>,
) -> AppResult<()> {
    for role_name in DEFAULT_ROLE_CANDIDATES {
        let assigned =
            assign_role_by_storage(pool, storage, user_id, role_name, actor_user_id).await?;
        if assigned {
            return Ok(());
        }
    }

    warn!(
        user_id = user_id,
        "no default role assigned for newly created user"
    );
    Ok(())
}

async fn assign_role_by_storage(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
    role_name: &str,
    actor_user_id: Option<i64>,
) -> AppResult<bool> {
    let result = match storage {
        UserStorage::Auth => {
            sqlx::query(
                r#"
            INSERT INTO auth_user_roles (user_id, role_id)
            SELECT u.id, r.id
            FROM auth_users u
            JOIN auth_roles r ON LOWER(r.name) = LOWER($2)
            WHERE CAST(u.id AS TEXT) = $1
            ON CONFLICT DO NOTHING
            "#,
            )
            .bind(user_id)
            .bind(role_name)
            .execute(pool)
            .await
        }
        UserStorage::Legacy => {
            sqlx::query(
                r#"
            INSERT INTO user_roles (user_id, role_id, created_by)
            SELECT u.id, r.id, $2
            FROM users u
            JOIN roles r ON LOWER(r.name) = LOWER($3)
            WHERE CAST(u.id AS TEXT) = $1
            ON CONFLICT (user_id, role_id) DO NOTHING
            "#,
            )
            .bind(user_id)
            .bind(actor_user_id)
            .bind(role_name)
            .execute(pool)
            .await
        }
        UserStorage::Ods => {
            sqlx::query(
                r#"
            INSERT INTO ods_aios_user_roles (user_id, role_id, created_by)
            SELECT u.id, r.id, $2
            FROM ods_aios_users u
            JOIN ods_aios_roles r ON LOWER(r.name) = LOWER($3)
            WHERE CAST(u.id AS TEXT) = $1
              AND COALESCE(r.is_deleted, FALSE) = FALSE
              AND COALESCE(r.is_active, TRUE) = TRUE
            ON CONFLICT (user_id, role_id) DO NOTHING
            "#,
            )
            .bind(user_id)
            .bind(actor_user_id)
            .bind(role_name)
            .execute(pool)
            .await
        }
    };

    match result {
        Ok(result) => Ok(result.rows_affected() > 0),
        Err(error) if is_undefined_table(&error) || is_undefined_column(&error) => {
            warn!(
                ?error,
                ?storage,
                "role mapping table is unavailable when assigning default role"
            );
            Ok(false)
        }
        Err(error) => {
            error!(
                ?error,
                ?storage,
                role_name = role_name,
                "assign role failed"
            );
            Err(AppError::Internal)
        }
    }
}
