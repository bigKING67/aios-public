use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct CreateUserRequest {
    pub(crate) username: String,
    pub(crate) email: String,
    pub(crate) password: String,
    pub(crate) full_name: Option<String>,
    pub(crate) is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateUserRequest {
    pub(crate) email: Option<String>,
    pub(crate) full_name: Option<String>,
    pub(crate) is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateUserRolesRequest {
    pub(crate) role_ids: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct UserAdminResponse {
    pub(crate) id: String,
    pub(crate) username: String,
    pub(crate) email: String,
    pub(crate) full_name: Option<String>,
    pub(crate) is_active: bool,
    pub(crate) created_at: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct UserListResponse {
    pub(crate) items: Vec<UserAdminResponse>,
    pub(crate) total: usize,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct UserRoleItem {
    pub(crate) id: String,
    pub(crate) code: String,
    pub(crate) name: String,
    pub(crate) is_active: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct UserRoleListResponse {
    pub(crate) items: Vec<UserRoleItem>,
    pub(crate) total: usize,
}

#[derive(Debug, Serialize)]
pub(crate) struct MessageResponse {
    pub(crate) message: String,
}

#[derive(Debug)]
pub(crate) struct NormalizedCreateUserInput {
    pub(crate) username: String,
    pub(crate) email: String,
    pub(crate) password: String,
    pub(crate) full_name: Option<String>,
    pub(crate) is_active: bool,
}

#[derive(Debug)]
pub(crate) struct NormalizedUpdateUserInput {
    pub(crate) email: Option<String>,
    pub(crate) full_name: Option<String>,
    pub(crate) is_active: Option<bool>,
}
