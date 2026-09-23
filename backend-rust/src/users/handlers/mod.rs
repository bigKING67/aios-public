mod create;
mod delete;
mod list;
mod roles;
mod update;

use std::sync::Arc;

use axum::{
    routing::{get, put},
    Router,
};

use crate::state::AppState;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list::list_users).post(create::create_user))
        .route(
            "/{user_id}/roles",
            get(roles::get_user_roles).put(roles::update_user_roles),
        )
        .route(
            "/{user_id}",
            put(update::update_user).delete(delete::delete_user),
        )
}
