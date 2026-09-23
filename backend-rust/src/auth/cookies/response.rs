use axum::{
    http::{header::CACHE_CONTROL, HeaderValue},
    response::Response,
};

pub(in crate::auth) fn with_no_store_headers(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}
