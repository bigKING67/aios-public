use std::sync::Arc;

use axum::{extract::State, http::StatusCode, Json};
use serde_json::json;

use crate::state::AppState;

pub(crate) async fn root() -> Json<serde_json::Value> {
    Json(json!({
        "name": "AIOS API (Rust)",
        "version": "0.1.0",
        "docs": "N/A",
    }))
}

pub(crate) async fn health(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let db_ok = sqlx::query("SELECT 1").execute(&state.pool).await.is_ok();

    let mut connection = state.dragonfly_connection.clone();
    let ping_result = dragonfly_client::cmd("PING")
        .query_async::<String>(&mut connection)
        .await;
    let dragonfly_ok = ping_result.is_ok();

    Json(json!({
        "status": if db_ok && dragonfly_ok { "ok" } else { "degraded" },
        "database": if db_ok { "ok" } else { "unreachable" },
        "dragonfly": if dragonfly_ok { "ok" } else { "unreachable" },
        "service": "backend-rust",
    }))
}

pub(crate) async fn ready(
    State(state): State<Arc<AppState>>,
) -> (StatusCode, Json<serde_json::Value>) {
    let db_ok = sqlx::query("SELECT 1").execute(&state.pool).await.is_ok();

    let mut connection = state.dragonfly_connection.clone();
    let dragonfly_ok = dragonfly_client::cmd("PING")
        .query_async::<String>(&mut connection)
        .await
        .is_ok();
    let ready = db_ok && dragonfly_ok;

    (
        if ready {
            StatusCode::OK
        } else {
            StatusCode::SERVICE_UNAVAILABLE
        },
        Json(json!({
            "status": if ready { "ready" } else { "not_ready" },
            "database": if db_ok { "ok" } else { "unreachable" },
            "dragonfly": if dragonfly_ok { "ok" } else { "unreachable" },
            "service": "backend-rust",
        })),
    )
}
