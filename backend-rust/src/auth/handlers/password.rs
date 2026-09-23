use std::sync::Arc;

use axum::{extract::State, Json};
use bcrypt::{hash, verify, DEFAULT_COST};
use tracing::{error, warn};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::{
    fetch_user_by_id, update_password_hash, validate_new_password, ChangePasswordRequest,
    CurrentUser,
};

pub(crate) async fn change_password(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<ChangePasswordRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if payload.current_password.trim().is_empty() || payload.new_password.trim().is_empty() {
        return Err(AppError::bad_request("当前密码和新密码不能为空"));
    }

    if payload.current_password == payload.new_password {
        return Err(AppError::bad_request("新密码不能与当前密码相同"));
    }

    validate_new_password(payload.new_password.as_str())?;

    let user = fetch_user_by_id(&state.pool, &current_user.user_id)
        .await?
        .ok_or(AppError::Unauthorized)?;

    if !user.is_active {
        return Err(AppError::Unauthorized);
    }

    let password_ok = verify(
        payload.current_password.as_str(),
        user.password_hash.as_str(),
    )
    .map_err(|_| AppError::Unauthorized)?;
    if !password_ok {
        return Err(AppError::bad_request("当前密码不正确"));
    }

    let password_hash = hash(payload.new_password.as_str(), DEFAULT_COST).map_err(|error| {
        error!(?error, "failed to hash new password");
        AppError::Internal
    })?;

    let updated =
        update_password_hash(&state.pool, &current_user.user_id, password_hash.as_str()).await?;
    if !updated {
        warn!(user_id = %current_user.user_id, "change password target user not found");
        return Err(AppError::Unauthorized);
    }

    Ok(Json(serde_json::json!({
        "message": "密码修改成功"
    })))
}
