use super::super::{DEFAULT_ACCESS_COOKIE_NAME, DEFAULT_REFRESH_COOKIE_NAME};

fn resolve_cookie_name(env_key: &str, fallback: &str) -> String {
    std::env::var(env_key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

pub(super) fn access_cookie_name() -> String {
    resolve_cookie_name("AIOS_ACCESS_COOKIE_NAME", DEFAULT_ACCESS_COOKIE_NAME)
}

pub(super) fn refresh_cookie_name() -> String {
    resolve_cookie_name("AIOS_REFRESH_COOKIE_NAME", DEFAULT_REFRESH_COOKIE_NAME)
}

pub(super) fn is_cookie_secure() -> bool {
    std::env::var("NODE_ENV")
        .ok()
        .map(|value| value.trim().eq_ignore_ascii_case("production"))
        .unwrap_or(false)
}
