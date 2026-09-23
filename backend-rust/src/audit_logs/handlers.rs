use std::sync::Arc;

use axum::{
    extract::{Query, State},
    Json,
};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::{AppError, AppResult},
    state::AppState,
};

use super::storage::{
    count_audit_logs_by_storage, query_audit_logs_by_storage, resolve_audit_storage,
};
use super::types::{
    AuditLogListResponse, AuditLogQuery, AUDIT_LIST_PERMISSIONS, DEFAULT_PAGE, DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
};

pub(super) async fn list_audit_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AuditLogQuery>,
    current_user: CurrentUser,
) -> AppResult<Json<AuditLogListResponse>> {
    ensure_any_permission(&current_user, &AUDIT_LIST_PERMISSIONS)?;

    let page = query.page.unwrap_or(DEFAULT_PAGE).max(1);
    let page_size = query
        .page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);
    let offset = (page - 1) * page_size;

    let module_filter = normalize_filter(query.module);
    let action_filter = normalize_filter(query.action);
    let keyword_filter = normalize_filter(query.keyword);

    let storage = resolve_audit_storage(&state.pool)
        .await?
        .ok_or_else(|| AppError::bad_request("当前环境未初始化审计日志表，无法查询审计日志"))?;

    let total = count_audit_logs_by_storage(
        &state.pool,
        storage,
        module_filter.as_deref(),
        action_filter.as_deref(),
        keyword_filter.as_deref(),
    )
    .await?;
    let items = query_audit_logs_by_storage(
        &state.pool,
        storage,
        module_filter.as_deref(),
        action_filter.as_deref(),
        keyword_filter.as_deref(),
        page_size,
        offset,
    )
    .await?;

    Ok(Json(AuditLogListResponse {
        items,
        total,
        page,
        page_size,
    }))
}

fn normalize_filter(raw: Option<String>) -> Option<String> {
    raw.map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}
