use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub(crate) struct CreateRoleRequest {
    pub(crate) name: String,
    pub(crate) code: String,
    pub(crate) description: Option<String>,
    pub(crate) is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateRoleRequest {
    pub(crate) name: Option<String>,
    pub(crate) code: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateRolePermissionsRequest {
    pub(crate) permission_ids: Vec<serde_json::Value>,
}

#[derive(Debug)]
pub(crate) struct NormalizedRoleInput {
    pub(crate) name: String,
    pub(crate) code: String,
    pub(crate) description: Option<String>,
    pub(crate) is_active: bool,
}

#[derive(Debug)]
pub(crate) struct NormalizedRolePatch {
    pub(crate) name: Option<String>,
    pub(crate) code: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) is_active: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct RoleListItem {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) code: String,
    pub(crate) description: Option<String>,
    pub(crate) is_active: bool,
    pub(crate) created_at: String,
    pub(crate) permissions_count: i64,
    pub(crate) user_count: i64,
}

#[derive(Debug, Serialize)]
pub(crate) struct RoleListResponse {
    pub(crate) items: Vec<RoleListItem>,
    pub(crate) total: usize,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct RolePermissionItem {
    pub(crate) id: i64,
    pub(crate) code: String,
    pub(crate) display_name: Option<String>,
    pub(crate) module: Option<String>,
    pub(crate) action: Option<String>,
    pub(crate) resource_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct RoleDetailResponse {
    #[serde(flatten)]
    pub(crate) role: RoleListItem,
    pub(crate) permissions: Vec<RolePermissionItem>,
}

#[derive(Debug, Serialize)]
pub(crate) struct MessageResponse {
    pub(crate) message: String,
}
