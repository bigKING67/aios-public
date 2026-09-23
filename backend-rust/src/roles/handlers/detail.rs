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

use super::ROLE_LIST_PERMISSIONS;
use crate::roles::{
    permission_storage::query_role_permissions_by_storage,
    storage::{query_role_detail_by_storage, resolve_role_storage},
    types::RoleDetailResponse,
};

pub(in crate::roles) async fn get_role(
    State(state): State<Arc<AppState>>,
    Path(raw_role_id): Path<String>,
    current_user: CurrentUser,
) -> AppResult<Json<RoleDetailResponse>> {
    ensure_any_permission(&current_user, &ROLE_LIST_PERMISSIONS)?;

    let role_id = raw_role_id.trim();
    if role_id.is_empty() {
        return Err(AppError::bad_request("角色 ID 不能为空"));
    }

    let storage = resolve_role_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化角色表，无法查询角色详情"))?;

    let role = query_role_detail_by_storage(&state.pool, storage, role_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let permissions = query_role_permissions_by_storage(&state.pool, storage, role_id).await?;

    Ok(Json(RoleDetailResponse { role, permissions }))
}
