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
    constants::USER_DELETE_PERMISSIONS,
    storage::{resolve_user_storage, soft_delete_user_by_storage},
    types::MessageResponse,
};

pub(super) async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(raw_user_id): Path<String>,
    current_user: CurrentUser,
) -> AppResult<Json<MessageResponse>> {
    ensure_any_permission(&current_user, &USER_DELETE_PERMISSIONS)?;

    let user_id = raw_user_id.trim();
    if user_id.is_empty() {
        return Err(AppError::bad_request("用户 ID 不能为空"));
    }

    if user_id == current_user.user_id {
        return Err(AppError::bad_request("不能删除当前登录账号"));
    }

    let storage = resolve_user_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化用户存储表，无法删除用户"))?;

    let deleted = soft_delete_user_by_storage(&state.pool, storage, user_id).await?;
    if !deleted {
        return Err(AppError::NotFound);
    }

    Ok(Json(MessageResponse {
        message: "用户删除成功".to_string(),
    }))
}
