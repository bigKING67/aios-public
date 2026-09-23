use serde::{Deserialize, Serialize};

pub(super) const AUDIT_LIST_PERMISSIONS: [&str; 5] = [
    "audit:list:all",
    "audit:view:all",
    "audit:view",
    "user:list:all",
    "user:list",
];
pub(super) const DEFAULT_PAGE: i64 = 1;
pub(super) const DEFAULT_PAGE_SIZE: i64 = 20;
pub(super) const MAX_PAGE_SIZE: i64 = 200;

#[derive(Debug, Clone, Copy)]
pub(super) enum AuditStorage {
    Legacy,
    Ods,
}

#[derive(Debug, Deserialize)]
pub(super) struct AuditLogQuery {
    pub(super) page: Option<i64>,
    pub(super) page_size: Option<i64>,
    pub(super) module: Option<String>,
    pub(super) action: Option<String>,
    pub(super) keyword: Option<String>,
}

#[derive(Debug, Serialize)]
pub(super) struct AuditLogListResponse {
    pub(super) items: Vec<AuditLogItem>,
    pub(super) total: i64,
    pub(super) page: i64,
    pub(super) page_size: i64,
}

#[derive(Debug, Serialize)]
pub(super) struct AuditLogItem {
    pub(super) id: String,
    pub(super) module: Option<String>,
    pub(super) action: Option<String>,
    pub(super) resource_type: Option<String>,
    pub(super) resource_id: Option<String>,
    pub(super) username: Option<String>,
    pub(super) operator: Option<String>,
    pub(super) success: bool,
    pub(super) status: Option<String>,
    pub(super) ip_address: Option<String>,
    pub(super) user_agent: Option<String>,
    pub(super) detail: Option<String>,
    pub(super) created_at: String,
}
