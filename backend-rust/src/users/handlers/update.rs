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

use super::super::{
    constants::USER_EDIT_PERMISSIONS,
    storage::{resolve_user_storage, update_user_by_storage},
    types::{UpdateUserRequest, UserAdminResponse},
    validation::normalize_update_input,
};

pub(super) async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(raw_user_id): Path<String>,
    current_user: CurrentUser,
    Json(payload): Json<UpdateUserRequest>,
) -> AppResult<Json<UserAdminResponse>> {
    ensure_any_permission(&current_user, &USER_EDIT_PERMISSIONS)?;

    let user_id = raw_user_id.trim();
    if user_id.is_empty() {
        return Err(AppError::bad_request("用户 ID 不能为空"));
    }

    let input = normalize_update_input(payload)?;

    let storage = resolve_user_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化用户存储表，无法更新用户"))?;

    let updated = update_user_by_storage(&state.pool, storage, user_id, &input)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(updated))
}
