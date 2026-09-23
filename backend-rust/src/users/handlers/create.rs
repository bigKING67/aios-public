use std::sync::Arc;

use axum::{extract::State, Json};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::AppResult,
    state::AppState,
};

use super::super::{
    account_creation::create_user_account,
    constants::USER_CREATE_PERMISSIONS,
    types::{CreateUserRequest, UserAdminResponse},
};

pub(super) async fn create_user(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<CreateUserRequest>,
) -> AppResult<Json<UserAdminResponse>> {
    ensure_any_permission(&current_user, &USER_CREATE_PERMISSIONS)?;

    let created = create_user_account(&state.pool, &current_user.user_id, payload).await?;
    Ok(Json(created))
}
