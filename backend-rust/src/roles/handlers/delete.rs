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

use super::ROLE_DELETE_PERMISSIONS;
use crate::roles::{
    elevated::ensure_can_mutate_elevated_role,
    storage::{query_role_detail_by_storage, resolve_role_storage, soft_delete_role_by_storage},
    types::MessageResponse,
};

pub(in crate::roles) async fn delete_role(
    State(state): State<Arc<AppState>>,
    Path(raw_role_id): Path<String>,
    current_user: CurrentUser,
) -> AppResult<Json<MessageResponse>> {
    ensure_any_permission(&current_user, &ROLE_DELETE_PERMISSIONS)?;

    let role_id = raw_role_id.trim();
    if role_id.is_empty() {
        return Err(AppError::bad_request("角色 ID 不能为空"));
    }

    let storage = resolve_role_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化角色表，无法删除角色"))?;
    let current_role = query_role_detail_by_storage(&state.pool, storage, role_id)
        .await?
        .ok_or(AppError::NotFound)?;
    ensure_can_mutate_elevated_role(&current_user, Some(current_role.code.as_str()), None)?;

    let deleted = soft_delete_role_by_storage(&state.pool, storage, role_id).await?;
    if !deleted {
        return Err(AppError::NotFound);
    }

    Ok(Json(MessageResponse {
        message: "角色删除成功".to_string(),
    }))
}
