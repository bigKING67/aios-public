mod cleanup;
mod handlers;
mod recording_segments;
mod repository;
mod repository_sql;
mod segment_offsets;
mod storage_objects;
mod types;
mod upload_xml;
mod uploads;
mod validation;

use std::sync::Arc;

use axum::Router;

use crate::state::AppState;

pub(crate) fn router() -> Router<Arc<AppState>> {
    handlers::router()
}

pub(crate) fn spawn_stale_upload_cleanup(state: Arc<AppState>) {
    cleanup::spawn_stale_upload_cleanup(state);
}
