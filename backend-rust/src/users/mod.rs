mod account_creation;
mod constants;
mod elevated;
mod handlers;
mod role_storage;
mod storage;
mod types;
mod validation;

use std::sync::Arc;

use axum::Router;

use crate::state::AppState;

pub(crate) use account_creation::create_user_account;
pub(crate) use types::{CreateUserRequest, UserAdminResponse};

pub fn router() -> Router<Arc<AppState>> {
    handlers::router()
}
