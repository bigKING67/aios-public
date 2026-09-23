use sqlx::PgPool;
use tracing::{error, warn};

use crate::error::{AppError, AppResult};

pub(crate) async fn update_last_login_at(pool: &PgPool, user_id: &str) {
    let update_queries = [
        "UPDATE auth_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE CAST(id AS TEXT) = $1",
        "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE CAST(id AS TEXT) = $1",
        "UPDATE ods_aios_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE CAST(id AS TEXT) = $1",
    ];

    for query in update_queries {
        match sqlx::query(query).bind(user_id).execute(pool).await {
            Ok(_) => return,
            Err(error) if super::is_undefined_table(&error) => continue,
            Err(error) => {
                warn!(?error, "update last_login_at failed");
                return;
            }
        }
    }
}

pub(crate) fn validate_new_password(new_password: &str) -> AppResult<()> {
    let length = new_password.chars().count();
    if length < 8 {
        return Err(AppError::bad_request("新密码长度至少为 8 位"));
    }

    if length > 128 {
        return Err(AppError::bad_request("新密码长度不能超过 128 位"));
    }

    let has_letter = new_password.chars().any(|c| c.is_ascii_alphabetic());
    let has_digit = new_password.chars().any(|c| c.is_ascii_digit());
    if !has_letter || !has_digit {
        return Err(AppError::bad_request("新密码至少包含 1 个字母和 1 个数字"));
    }

    Ok(())
}

pub(crate) async fn update_password_hash(
    pool: &PgPool,
    user_id: &str,
    password_hash: &str,
) -> AppResult<bool> {
    let update_queries = [
        "UPDATE auth_users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE CAST(id AS TEXT) = $1",
        "UPDATE auth_users SET password_hash = $2 WHERE CAST(id AS TEXT) = $1",
        "UPDATE users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE CAST(id AS TEXT) = $1",
        "UPDATE users SET password_hash = $2 WHERE CAST(id AS TEXT) = $1",
        "UPDATE ods_aios_users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE CAST(id AS TEXT) = $1",
        "UPDATE ods_aios_users SET password_hash = $2 WHERE CAST(id AS TEXT) = $1",
    ];

    for query in update_queries {
        match sqlx::query(query)
            .bind(user_id)
            .bind(password_hash)
            .execute(pool)
            .await
        {
            Ok(result) if result.rows_affected() > 0 => return Ok(true),
            Ok(_) => continue,
            Err(error)
                if super::is_undefined_table(&error) || super::is_undefined_column(&error) =>
            {
                continue
            }
            Err(error) => {
                error!(?error, "update password hash failed");
                return Err(AppError::Internal);
            }
        }
    }

    Ok(false)
}
