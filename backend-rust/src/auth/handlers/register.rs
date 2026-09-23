use std::sync::Arc;

use axum::{extract::State, Json};

use crate::{
    error::AppResult,
    state::AppState,
    users::{create_user_account, CreateUserRequest, UserAdminResponse},
};

use super::super::CurrentUser;

pub(crate) async fn register(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<CreateUserRequest>,
) -> AppResult<Json<UserAdminResponse>> {
    // 同时兼容新旧权限编码，避免历史权限数据导致管理员页面创建用户失败。
    super::super::ensure_any_permission(&current_user, &["user:create:all", "user:create"])?;

    let created = create_user_account(&state.pool, &current_user.user_id, payload).await?;
    Ok(Json(created))
}
