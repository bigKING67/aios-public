use axum::http::HeaderMap;

fn header_requests_no_cache(value: Option<&axum::http::HeaderValue>) -> bool {
    value
        .and_then(|header| header.to_str().ok())
        .map(|raw| {
            let normalized = raw.trim().to_ascii_lowercase();
            normalized.contains("no-cache")
                || normalized.contains("no-store")
                || normalized.contains("max-age=0")
        })
        .unwrap_or(false)
}

pub(super) fn should_bypass_backend_report_cache(headers: &HeaderMap) -> bool {
    header_requests_no_cache(headers.get("x-cache-control"))
        || header_requests_no_cache(headers.get(axum::http::header::CACHE_CONTROL))
}
