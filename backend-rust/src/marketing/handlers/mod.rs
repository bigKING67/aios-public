use std::sync::Arc;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};

use crate::{
    marketing::creator_library_xlsx::CREATOR_LIBRARY_XLSX_BODY_LIMIT_BYTES, state::AppState,
};

mod authz;
mod creator;
mod filter_options;
mod follow_logs;
mod import_export;
mod request_helpers;

pub(super) fn creator_library_router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/",
            get(creator::list_creator_library).post(creator::create_creator),
        )
        .route(
            "/filter-options",
            get(filter_options::get_creator_filter_options),
        )
        .route("/import", post(import_export::import_creators))
        .route(
            "/import/parse-xlsx",
            post(import_export::parse_creator_library_xlsx_upload)
                .layer(DefaultBodyLimit::max(CREATOR_LIBRARY_XLSX_BODY_LIMIT_BYTES)),
        )
        .route("/template.csv", get(import_export::download_template_csv))
        .route("/template.xlsx", get(import_export::download_template_xlsx))
        .route("/export.csv", get(import_export::export_creators_csv))
        .route(
            "/{id}",
            get(creator::get_creator)
                .put(creator::update_creator)
                .delete(creator::delete_creator),
        )
        .route(
            "/{id}/follow-logs",
            get(follow_logs::list_creator_follow_logs).post(follow_logs::create_creator_follow_log),
        )
        .route(
            "/{id}/follow-logs/{log_id}",
            axum::routing::patch(follow_logs::update_creator_follow_log)
                .delete(follow_logs::delete_creator_follow_log),
        )
}
