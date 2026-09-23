use std::sync::Arc;

use axum::Router;

use crate::state::AppState;

mod handlers;
mod repository;
mod row_mapping;
mod types;
mod validation;

pub(super) fn router() -> Router<Arc<AppState>> {
    handlers::router()
}
