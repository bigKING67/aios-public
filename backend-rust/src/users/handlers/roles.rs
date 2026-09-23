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
    constants::{USER_ASSIGN_ROLE_PERMISSIONS, USER_LIST_PERMISSIONS},
    elevated::ensure_can_mutate_elevated_roles,
    role_storage::{
        query_role_codes_by_ids_by_storage, query_user_roles_by_storage,
        replace_user_roles_by_storage,
    },
    storage::{resolve_user_storage, user_exists_by_storage},
    types::{UpdateUserRolesRequest, UserRoleListResponse},
    validation::normalize_role_ids,
};

pub(super) async fn get_user_roles(
    State(state): State<Arc<AppState>>,
    Path(raw_user_id): Path<String>,
    current_user: CurrentUser,
) -> AppResult<Json<UserRoleListResponse>> {
    ensure_any_permission(&current_user, &USER_LIST_PERMISSIONS)?;

    let user_id = raw_user_id.trim();
    if user_id.is_empty() {
        return Err(AppError::bad_request("用户 ID 不能为空"));
    }

    let storage = resolve_user_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化用户存储表，无法查询用户角色"))?;

    let exists = user_exists_by_storage(&state.pool, storage, user_id).await?;
    if !exists {
        return Err(AppError::NotFound);
    }

    let items = query_user_roles_by_storage(&state.pool, storage, user_id).await?;
    Ok(Json(UserRoleListResponse {
        total: items.len(),
        items,
    }))
}

pub(super) async fn update_user_roles(
    State(state): State<Arc<AppState>>,
    Path(raw_user_id): Path<String>,
    current_user: CurrentUser,
    Json(payload): Json<UpdateUserRolesRequest>,
) -> AppResult<Json<UserRoleListResponse>> {
    ensure_any_permission(&current_user, &USER_ASSIGN_ROLE_PERMISSIONS)?;

    let user_id = raw_user_id.trim();
    if user_id.is_empty() {
        return Err(AppError::bad_request("用户 ID 不能为空"));
    }

    let normalized_role_ids = normalize_role_ids(payload.role_ids)?;
    let storage = resolve_user_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化用户存储表，无法更新用户角色"))?;

    let exists = user_exists_by_storage(&state.pool, storage, user_id).await?;
    if !exists {
        return Err(AppError::NotFound);
    }

    let current_role_items = query_user_roles_by_storage(&state.pool, storage, user_id).await?;
    let current_role_codes = current_role_items
        .iter()
        .map(|item| item.code.clone())
        .collect::<Vec<String>>();

    let next_role_codes =
        query_role_codes_by_ids_by_storage(&state.pool, storage, &normalized_role_ids).await?;
    if next_role_codes.len() != normalized_role_ids.len() {
        return Err(AppError::bad_request(
            "提交的角色 ID 中包含不存在或不可用角色",
        ));
    }

    ensure_can_mutate_elevated_roles(&current_user, &current_role_codes, &next_role_codes)?;

    let actor_user_id = current_user.user_id.trim().parse::<i64>().ok();
    replace_user_roles_by_storage(
        &state.pool,
        storage,
        user_id,
        &normalized_role_ids,
        actor_user_id,
    )
    .await?;

    let items = query_user_roles_by_storage(&state.pool, storage, user_id).await?;
    Ok(Json(UserRoleListResponse {
        total: items.len(),
        items,
    }))
}
