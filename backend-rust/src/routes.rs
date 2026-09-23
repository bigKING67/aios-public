use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Extension, Json, Router,
};
use serde_json::json;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{
    audit_logs, auth, content_live_center, dashboard, dataops,
    health::{health, ready, root},
    marketing, permissions, reports, roles, sample_inventory,
    state::AppState,
    users,
};

fn build_api_router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/audit-logs", audit_logs::router())
        .nest("/dataops", dataops::router())
        .nest("/content/live-center", content_live_center::router())
        .nest("/dashboard", dashboard::router())
        .nest("/marketing", marketing::router())
        .nest("/sample-inventory", sample_inventory::router(state))
        .nest("/permissions", permissions::router())
        .nest("/roles", roles::router())
        .nest("/users", users::router())
        .nest("/reports", reports::router())
}

#[cfg(test)]
pub(crate) fn build_app(state: Arc<AppState>, cors: CorsLayer) -> Router {
    build_app_with_runtime_mode(state, cors, false)
}

pub(crate) fn build_app_with_runtime_mode(
    state: Arc<AppState>,
    cors: CorsLayer,
    runtime_read_only: bool,
) -> Router {
    let api = build_api_router(Arc::clone(&state));
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/ready", get(ready))
        .nest("/v1", api.clone())
        .nest("/v2", api)
        .with_state(state)
        .layer(Extension(auth::AuthRuntimePolicy::new(runtime_read_only)))
        .layer(middleware::from_fn_with_state(
            runtime_read_only,
            enforce_runtime_read_only,
        ))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
}

async fn enforce_runtime_read_only(
    State(runtime_read_only): State<bool>,
    request: Request,
    next: Next,
) -> Response {
    if runtime_read_only
        && !is_read_only_runtime_request_allowed(request.method(), request.uri().path())
    {
        let mut response = (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "message": "runtime is read-only" })),
        )
            .into_response();
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        return response;
    }

    next.run(request).await
}

fn is_read_only_runtime_request_allowed(method: &Method, path: &str) -> bool {
    if matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return true;
    }

    *method == Method::POST
        && matches!(
            path,
            "/v1/auth/session/refresh" | "/v2/auth/session/refresh"
        )
}

#[cfg(test)]
mod tests {
    use axum::http::Method;

    use super::is_read_only_runtime_request_allowed;

    #[test]
    fn read_only_runtime_allows_safe_methods_on_every_path() {
        for method in [Method::GET, Method::HEAD, Method::OPTIONS] {
            assert!(is_read_only_runtime_request_allowed(
                &method,
                "/v1/dataops/runtime"
            ));
        }
    }

    #[test]
    fn read_only_runtime_allows_only_cookie_session_refresh_posts() {
        for path in ["/v1/auth/session/refresh", "/v2/auth/session/refresh"] {
            assert!(is_read_only_runtime_request_allowed(&Method::POST, path));
        }

        for path in [
            "/v1/auth/refresh",
            "/v1/auth/session/login",
            "/v1/auth/session/logout",
            "/v1/dataops/runtime/pipelines/daily_business_brief/trigger",
            "/v1/auth/session/refresh/extra",
        ] {
            assert!(!is_read_only_runtime_request_allowed(&Method::POST, path));
        }

        for method in [Method::PUT, Method::PATCH, Method::DELETE] {
            assert!(!is_read_only_runtime_request_allowed(
                &method,
                "/v1/auth/session/refresh"
            ));
        }
    }
}
