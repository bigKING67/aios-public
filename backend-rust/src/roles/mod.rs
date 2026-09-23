use std::sync::Arc;

use axum::{
    routing::{get, put},
    Router,
};

use crate::state::AppState;

mod elevated;
mod handlers;
mod permission_storage;
mod storage;
mod types;
mod validation;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(handlers::list_roles).post(handlers::create_role))
        .route(
            "/{role_id}",
            get(handlers::get_role)
                .put(handlers::update_role)
                .delete(handlers::delete_role),
        )
        .route(
            "/{role_id}/permissions",
            put(handlers::update_role_permissions),
        )
}
