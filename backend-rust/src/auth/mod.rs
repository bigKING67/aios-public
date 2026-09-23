use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};

use crate::state::AppState;

const ACCESS_TOKEN_TYPE: &str = "access";
const REFRESH_TOKEN_TYPE: &str = "refresh";
const DEFAULT_ACCESS_COOKIE_NAME: &str = "aios_access_token";
const DEFAULT_REFRESH_COOKIE_NAME: &str = "aios_refresh_token";
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS: i64 = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS: i64 = 30 * 24 * 60 * 60;

#[derive(Clone, Copy)]
pub(crate) struct AuthRuntimePolicy {
    pub(in crate::auth) read_only: bool,
}

impl AuthRuntimePolicy {
    pub(crate) fn new(read_only: bool) -> Self {
        Self { read_only }
    }
}

mod cookies;
mod current_user;
mod handlers;
mod storage;
mod tokens;
mod types;

use cookies::{
    append_access_token_cookie_header, append_auth_clear_cookie_headers,
    append_auth_set_cookie_headers, build_session_user, extract_access_token_from_headers,
    extract_refresh_token_from_headers, with_no_store_headers,
};
pub(crate) use current_user::resolve_optional_current_user;
pub use current_user::{ensure_any_permission, CurrentUser};
use storage::{
    fetch_user_by_id, fetch_user_by_username, fetch_user_permissions, fetch_user_profile,
    fetch_user_roles, persist_refresh_token, revoke_refresh_token, update_last_login_at,
    update_password_hash, validate_new_password, validate_refresh_token_storage,
};
pub use types::{AuthUserResponse, TokenResponse};
use types::{
    ChangePasswordRequest, LoginRequest, LogoutRequest, RefreshRequest, SessionLoginResponse,
    SessionLogoutResponse, SessionMeResponse, SessionRefreshResponse, SessionUserResponse,
    UserAccount,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/login", post(handlers::login))
        .route("/register", post(handlers::register))
        .route("/refresh", post(handlers::refresh_token))
        .route("/logout", post(handlers::logout))
        .route("/me", get(handlers::get_me))
        .route("/session/login", post(handlers::session_login))
        .route("/session/refresh", post(handlers::session_refresh))
        .route("/session/logout", post(handlers::session_logout))
        .route("/session/me", get(handlers::session_me))
        .route("/change-password", post(handlers::change_password))
}
