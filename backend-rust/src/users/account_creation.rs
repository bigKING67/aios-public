use bcrypt::{hash, DEFAULT_COST};
use sqlx::PgPool;
use tracing::{error, warn};

use crate::error::{AppError, AppResult};

use super::{
    storage::{assign_default_role, insert_user_by_storage, resolve_user_storage},
    types::{CreateUserRequest, UserAdminResponse},
    validation::normalize_create_input,
};

pub(crate) async fn create_user_account(
    pool: &PgPool,
    actor_user_id: &str,
    payload: CreateUserRequest,
) -> AppResult<UserAdminResponse> {
    let input = normalize_create_input(payload)?;
    let storage = resolve_user_storage(pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化用户存储表，无法创建用户"))?;

    let password_hash = hash(input.password.as_str(), DEFAULT_COST).map_err(|error| {
        error!(?error, "failed to hash password when creating user");
        AppError::Internal
    })?;

    let actor_user_id_numeric = actor_user_id.trim().parse::<i64>().ok();

    let created = insert_user_by_storage(
        pool,
        storage,
        &input,
        password_hash.as_str(),
        actor_user_id_numeric,
    )
    .await?;

    if let Err(error) =
        assign_default_role(pool, storage, created.id.as_str(), actor_user_id_numeric).await
    {
        warn!(?error, user_id = %created.id, "default role assignment failed");
    }

    Ok(created)
}
