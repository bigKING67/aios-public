use std::sync::Arc;

use axum::{routing::get, Router};

use crate::state::AppState;

mod handlers;
mod row_mapping;
mod storage;
mod types;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/", get(handlers::list_audit_logs))
}
