use axum::http::{
    header::{AUTHORIZATION, COOKIE},
    HeaderMap,
};

use super::names::{access_cookie_name, refresh_cookie_name};

fn extract_cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw_cookie = headers.get(COOKIE)?.to_str().ok()?;

    for item in raw_cookie.split(';') {
        let mut segments = item.trim().splitn(2, '=');
        let key = segments.next()?.trim();
        let value = segments.next().unwrap_or("").trim();
        if key == name && !value.is_empty() {
            return Some(value.to_string());
        }
    }

    None
}

pub(in crate::auth) fn extract_access_token_from_headers(headers: &HeaderMap) -> Option<String> {
    let access_cookie = access_cookie_name();

    if let Some(token) = extract_cookie_value(headers, access_cookie.as_str()) {
        return Some(token);
    }

    let auth_header = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())?;

    auth_header
        .strip_prefix("Bearer ")
        .or_else(|| auth_header.strip_prefix("bearer "))
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

pub(in crate::auth) fn extract_refresh_token_from_headers(headers: &HeaderMap) -> Option<String> {
    let refresh_cookie = refresh_cookie_name();
    extract_cookie_value(headers, refresh_cookie.as_str())
}
