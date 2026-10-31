//! 招聘在线测试：候选人匿名提交，管理员查看与评分。
use std::sync::Arc;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post, put},
    Router,
};

use crate::state::AppState;

mod domain;
mod handlers;
#[cfg(test)]
mod http_route_tests;
mod intake_guard;
#[cfg(test)]
mod postgres_tests;
mod repository;
mod rubric;
mod types;

/// Generous for the longest allowed answers (about 31k CJK chars ≈ 94 KB).
const PUBLIC_SUBMISSION_BODY_LIMIT_BYTES: usize = 128 * 1024;

pub fn router() -> Router<Arc<AppState>> {
    public_router()
        .route("/submissions", get(handlers::list_submissions))
        .route(
            "/submissions/{submission_id}",
            get(handlers::get_submission),
        )
        .route(
            "/submissions/{submission_id}/review",
            put(handlers::save_review),
        )
        .route("/rubric", get(handlers::get_rubric))
}

/// Candidate intake only; never mounts answer reads, scoring or the internal rubric.
pub fn public_router() -> Router<Arc<AppState>> {
    Router::new().route(
        "/public/submissions",
        post(handlers::create_public_submission)
            .layer(DefaultBodyLimit::max(PUBLIC_SUBMISSION_BODY_LIMIT_BYTES)),
    )
}
