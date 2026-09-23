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

use super::ROLE_ASSIGN_PERMISSION_PERMISSIONS;
use crate::roles::{
    elevated::ensure_can_mutate_elevated_role,
    permission_storage::replace_role_permissions_by_storage,
    storage::{query_role_detail_by_storage, resolve_role_storage},
    types::{MessageResponse, UpdateRolePermissionsRequest},
    validation::normalize_permission_ids,
};

pub(in crate::roles) async fn update_role_permissions(
    State(state): State<Arc<AppState>>,
    Path(raw_role_id): Path<String>,
    current_user: CurrentUser,
    Json(payload): Json<UpdateRolePermissionsRequest>,
) -> AppResult<Json<MessageResponse>> {
    ensure_any_permission(&current_user, &ROLE_ASSIGN_PERMISSION_PERMISSIONS)?;

    let role_id = raw_role_id.trim();
    if role_id.is_empty() {
        return Err(AppError::bad_request("角色 ID 不能为空"));
    }

    let permission_ids = normalize_permission_ids(&payload.permission_ids)?;
    let storage = resolve_role_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化角色表，无法更新角色权限"))?;
    let current_role = query_role_detail_by_storage(&state.pool, storage, role_id)
        .await?
        .ok_or(AppError::NotFound)?;
    ensure_can_mutate_elevated_role(&current_user, Some(current_role.code.as_str()), None)?;

    let actor_user_id = current_user.user_id.trim().parse::<i64>().ok();

    replace_role_permissions_by_storage(
        &state.pool,
        storage,
        role_id,
        &permission_ids,
        actor_user_id,
    )
    .await?;

    Ok(Json(MessageResponse {
        message: "角色权限更新成功".to_string(),
    }))
}
