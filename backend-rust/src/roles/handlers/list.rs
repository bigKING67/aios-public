use std::sync::Arc;

use axum::{extract::State, Json};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::{AppError, AppResult},
    state::AppState,
};

use super::ROLE_LIST_PERMISSIONS;
use crate::roles::{
    storage::{query_roles_by_storage, resolve_role_storage},
    types::RoleListResponse,
};

pub(in crate::roles) async fn list_roles(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<RoleListResponse>> {
    ensure_any_permission(&current_user, &ROLE_LIST_PERMISSIONS)?;

    let storage = resolve_role_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化角色表，无法查询角色列表"))?;

    let items = query_roles_by_storage(&state.pool, storage).await?;
    Ok(Json(RoleListResponse {
        total: items.len(),
        items,
    }))
}
