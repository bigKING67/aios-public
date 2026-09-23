use std::sync::Arc;

use axum::{extract::State, Json};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::{
    constants::USER_LIST_PERMISSIONS,
    storage::{query_users_by_storage, resolve_user_storage},
    types::UserListResponse,
};

pub(super) async fn list_users(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<UserListResponse>> {
    ensure_any_permission(&current_user, &USER_LIST_PERMISSIONS)?;

    let storage = resolve_user_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化用户存储表，无法查询用户列表"))?;

    let items = query_users_by_storage(&state.pool, storage).await?;

    Ok(Json(UserListResponse {
        total: items.len(),
        items,
    }))
}
