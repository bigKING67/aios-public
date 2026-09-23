mod permissions;
mod roles;
mod row_values;

use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use permissions::{query_permissions_auth, query_permissions_ods, query_permissions_users};
use roles::{query_roles_auth, query_roles_ods, query_roles_users};

pub(crate) async fn fetch_user_roles(pool: &PgPool, user_id: &str) -> AppResult<Vec<String>> {
    match query_roles_auth(pool, user_id).await {
        Ok(roles) if !roles.is_empty() => return Ok(roles),
        Ok(_) => {}
        Err(error) if super::is_undefined_table(&error) => {}
        Err(error) => {
            error!(?error, "query auth roles failed");
            return Err(AppError::Internal);
        }
    }

    if let Ok(user_id_int) = user_id.parse::<i64>() {
        match query_roles_users(pool, user_id_int).await {
            Ok(roles) if !roles.is_empty() => return Ok(roles),
            Ok(_) => {}
            Err(error) if super::is_undefined_table(&error) => {}
            Err(error) => {
                error!(?error, "query legacy roles failed");
                return Err(AppError::Internal);
            }
        }

        match query_roles_ods(pool, user_id_int).await {
            Ok(roles) => return Ok(roles),
            Err(error) if super::is_undefined_table(&error) => return Ok(Vec::new()),
            Err(error) => {
                error!(?error, "query ods roles failed");
                return Err(AppError::Internal);
            }
        }
    }

    Ok(Vec::new())
}

pub(crate) async fn fetch_user_permissions(pool: &PgPool, user_id: &str) -> AppResult<Vec<String>> {
    match query_permissions_auth(pool, user_id).await {
        Ok(permissions) if !permissions.is_empty() => return Ok(permissions),
        Ok(_) => {}
        Err(error) if super::is_undefined_table(&error) => {}
        Err(error) => {
            error!(?error, "query auth permissions failed");
            return Err(AppError::Internal);
        }
    }

    if let Ok(user_id_int) = user_id.parse::<i64>() {
        match query_permissions_users(pool, user_id_int).await {
            Ok(permissions) if !permissions.is_empty() => return Ok(permissions),
            Ok(_) => {}
            Err(error) if super::is_undefined_table(&error) => {}
            Err(error) => {
                error!(?error, "query legacy permissions failed");
                return Err(AppError::Internal);
            }
        }

        match query_permissions_ods(pool, user_id_int).await {
            Ok(permissions) => return Ok(permissions),
            Err(error) if super::is_undefined_table(&error) => return Ok(Vec::new()),
            Err(error) => {
                error!(?error, "query ods permissions failed");
                return Err(AppError::Internal);
            }
        }
    }

    Ok(Vec::new())
}
