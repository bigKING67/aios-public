use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy)]
pub(super) enum PermissionStorage {
    Auth,
    Legacy,
    Ods,
}

#[derive(Debug, Deserialize)]
pub(super) struct PermissionQuery {
    pub(super) grouped: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct PermissionItem {
    pub(super) id: i64,
    pub(super) code: String,
    pub(super) name: Option<String>,
    pub(super) display_name: Option<String>,
    pub(super) module: Option<String>,
    pub(super) action: Option<String>,
    pub(super) resource_type: Option<String>,
    pub(super) description: Option<String>,
    pub(super) is_active: bool,
}

#[derive(Debug, Serialize)]
pub(super) struct PermissionListResponse {
    pub(super) items: Vec<PermissionItem>,
    pub(super) total: usize,
}
