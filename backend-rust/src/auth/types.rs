use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct LogoutRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Serialize)]
pub(in crate::auth) struct SessionUserResponse {
    pub(in crate::auth) id: String,
    pub(in crate::auth) username: String,
    pub(in crate::auth) email: String,
    pub(in crate::auth) full_name: Option<String>,
    pub(in crate::auth) roles: Vec<String>,
    pub(in crate::auth) is_active: bool,
}

#[derive(Debug, Serialize)]
pub(in crate::auth) struct SessionLoginResponse {
    pub(in crate::auth) user: SessionUserResponse,
    pub(in crate::auth) permissions: Vec<String>,
    pub(in crate::auth) access_token: String,
}

#[derive(Debug, Serialize)]
pub(in crate::auth) struct SessionRefreshResponse {
    pub(in crate::auth) success: bool,
    pub(in crate::auth) access_token: String,
}

#[derive(Debug, Serialize)]
pub(in crate::auth) struct SessionLogoutResponse {
    pub(in crate::auth) success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(in crate::auth) message: Option<String>,
}

#[derive(Debug, Serialize)]
pub(in crate::auth) struct SessionMeResponse {
    pub(in crate::auth) user: SessionUserResponse,
    pub(in crate::auth) permissions: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AuthUserResponse {
    pub id: String,
    pub username: String,
    pub email: String,
    pub full_name: Option<String>,
    pub is_active: bool,
    pub last_login_at: Option<String>,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_at: String,
    pub refresh_expires_at: String,
    pub user: AuthUserResponse,
}

#[derive(Debug, Clone)]
pub(in crate::auth) struct UserAccount {
    pub(in crate::auth) id: String,
    pub(in crate::auth) username: String,
    pub(in crate::auth) email: String,
    pub(in crate::auth) full_name: Option<String>,
    pub(in crate::auth) password_hash: String,
    pub(in crate::auth) is_active: bool,
    pub(in crate::auth) last_login_at: Option<DateTime<Utc>>,
}
