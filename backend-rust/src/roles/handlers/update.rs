use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::{AppError, AppResult},
    state::AppState,
};

use super::ROLE_EDIT_PERMISSIONS;
use crate::roles::{
    elevated::ensure_can_mutate_elevated_role,
    storage::{query_role_detail_by_storage, resolve_role_storage, update_role_by_storage},
    types::{RoleListItem, UpdateRoleRequest},
    validation::normalize_update_role,
};

pub(in crate::roles) async fn update_role(
    State(state): State<Arc<AppState>>,
    Path(raw_role_id): Path<String>,
    current_user: CurrentUser,
    Json(payload): Json<UpdateRoleRequest>,
) -> AppResult<Json<RoleListItem>> {
    ensure_any_permission(&current_user, &ROLE_EDIT_PERMISSIONS)?;

    let role_id = raw_role_id.trim();
    if role_id.is_empty() {
        return Err(AppError::bad_request("角色 ID 不能为空"));
    }

    let patch = normalize_update_role(payload)?;
    let storage = resolve_role_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化角色表，无法更新角色"))?;
    let current_role = query_role_detail_by_storage(&state.pool, storage, role_id)
        .await?
        .ok_or(AppError::NotFound)?;
    ensure_can_mutate_elevated_role(
        &current_user,
        Some(current_role.code.as_str()),
        patch.code.as_deref(),
    )?;

    let actor_user_id = current_user.user_id.trim().parse::<i64>().ok();
    let updated = update_role_by_storage(&state.pool, storage, role_id, &patch, actor_user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(updated))
}
