use axum::http::{HeaderValue, Method};
use http::header;
use tower_http::cors::CorsLayer;
use tracing::warn;

use crate::config::Settings;

pub(crate) fn build_cors_layer(settings: &Settings) -> anyhow::Result<CorsLayer> {
    let allowed_origins: Vec<HeaderValue> = settings
        .cors_origins
        .iter()
        .filter_map(|origin| match HeaderValue::from_str(origin.trim()) {
            Ok(value) => Some(value),
            Err(error) => {
                warn!(origin = %origin, ?error, "invalid CORS origin, skipped");
                None
            }
        })
        .collect();

    if allowed_origins.is_empty() {
        anyhow::bail!("CORS_ORIGINS has no valid origin, refusing to start with permissive CORS");
    }

    Ok(CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::ACCEPT,
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ORIGIN,
            header::COOKIE,
            header::CACHE_CONTROL,
            header::PRAGMA,
            header::HeaderName::from_static("x-requested-with"),
            header::HeaderName::from_static("x-csrf-token"),
            header::HeaderName::from_static("x-expected-updated-at"),
        ])
        .allow_credentials(true))
}
