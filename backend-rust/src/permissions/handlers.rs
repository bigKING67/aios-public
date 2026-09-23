use std::{collections::BTreeMap, sync::Arc};

use axum::{
    extract::{Query, State},
    Json,
};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    storage::{query_permissions_by_storage, resolve_permission_storage},
    types::{PermissionItem, PermissionListResponse, PermissionQuery},
};

const PERMISSION_LIST_PERMISSIONS: [&str; 6] = [
    "permission:list:all",
    "permission:list",
    "permission:view:all",
    "permission:view",
    "role:list:all",
    "role:list",
];

pub(super) async fn list_permissions(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PermissionQuery>,
    current_user: CurrentUser,
) -> AppResult<Json<serde_json::Value>> {
    ensure_any_permission(&current_user, &PERMISSION_LIST_PERMISSIONS)?;

    let storage = resolve_permission_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化权限表，无法查询权限列表"))?;

    let items = query_permissions_by_storage(&state.pool, storage).await?;
    if query.grouped.unwrap_or(true) {
        let grouped = group_permissions_by_module(&items);
        return Ok(Json(
            serde_json::to_value(grouped).unwrap_or_else(|_| serde_json::json!({})),
        ));
    }

    Ok(Json(
        serde_json::to_value(PermissionListResponse {
            total: items.len(),
            items,
        })
        .unwrap_or_else(|_| serde_json::json!({ "items": [], "total": 0 })),
    ))
}

fn group_permissions_by_module(items: &[PermissionItem]) -> BTreeMap<String, Vec<PermissionItem>> {
    let mut grouped: BTreeMap<String, Vec<PermissionItem>> = BTreeMap::new();
    for item in items {
        let module = item
            .module
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("general")
            .to_string();
        grouped.entry(module).or_default().push(item.clone());
    }
    grouped
}
