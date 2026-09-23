use std::sync::Arc;

use axum::{extract::State, Json};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::{AppError, AppResult},
    state::AppState,
};

use super::ROLE_CREATE_PERMISSIONS;
use crate::roles::{
    elevated::ensure_can_mutate_elevated_role,
    storage::{insert_role_by_storage, resolve_role_storage},
    types::{CreateRoleRequest, RoleListItem},
    validation::normalize_create_role,
};

pub(in crate::roles) async fn create_role(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<CreateRoleRequest>,
) -> AppResult<Json<RoleListItem>> {
    ensure_any_permission(&current_user, &ROLE_CREATE_PERMISSIONS)?;

    let input = normalize_create_role(payload)?;
    let storage = resolve_role_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化角色表，无法创建角色"))?;
    ensure_can_mutate_elevated_role(&current_user, None, Some(input.code.as_str()))?;

    let actor_user_id = current_user.user_id.trim().parse::<i64>().ok();
    let role = insert_role_by_storage(&state.pool, storage, &input, actor_user_id).await?;
    Ok(Json(role))
}
