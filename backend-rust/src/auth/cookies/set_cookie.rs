use axum::http::{header::SET_COOKIE, HeaderMap, HeaderValue};
use chrono::{DateTime, Utc};

use super::{
    super::{TokenResponse, DEFAULT_ACCESS_TOKEN_TTL_SECONDS, DEFAULT_REFRESH_TOKEN_TTL_SECONDS},
    names::{access_cookie_name, is_cookie_secure, refresh_cookie_name},
};

fn parse_iso_expiry_to_max_age_seconds(expires_at: &str, fallback: i64) -> i64 {
    let parsed = DateTime::parse_from_rfc3339(expires_at)
        .ok()
        .map(|value| value.with_timezone(&Utc))
        .map(|value| value.timestamp() - Utc::now().timestamp());

    match parsed {
        Some(value) if value > 0 => value,
        Some(_) => 1,
        None => fallback,
    }
}

fn build_set_cookie_value(name: &str, value: &str, max_age: i64, secure: bool) -> String {
    let mut cookie = format!("{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}");
    if secure {
        cookie.push_str("; Secure");
    }
    cookie
}

fn append_set_cookie(headers: &mut HeaderMap, value: String) {
    if let Ok(header_value) = HeaderValue::from_str(value.as_str()) {
        headers.append(SET_COOKIE, header_value);
    }
}

pub(in crate::auth) fn append_auth_set_cookie_headers(
    headers: &mut HeaderMap,
    tokens: &TokenResponse,
) {
    let refresh_name = refresh_cookie_name();
    let secure = is_cookie_secure();
    let refresh_max_age = parse_iso_expiry_to_max_age_seconds(
        tokens.refresh_expires_at.as_str(),
        DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
    );

    append_access_token_cookie_header(
        headers,
        tokens.access_token.as_str(),
        tokens.expires_at.as_str(),
    );
    append_set_cookie(
        headers,
        build_set_cookie_value(
            refresh_name.as_str(),
            tokens.refresh_token.as_str(),
            refresh_max_age,
            secure,
        ),
    );
}

pub(in crate::auth) fn append_access_token_cookie_header(
    headers: &mut HeaderMap,
    access_token: &str,
    expires_at: &str,
) {
    let access_name = access_cookie_name();
    let secure = is_cookie_secure();
    let access_max_age =
        parse_iso_expiry_to_max_age_seconds(expires_at, DEFAULT_ACCESS_TOKEN_TTL_SECONDS);

    append_set_cookie(
        headers,
        build_set_cookie_value(access_name.as_str(), access_token, access_max_age, secure),
    );
}

pub(in crate::auth) fn append_auth_clear_cookie_headers(headers: &mut HeaderMap) {
    let access_name = access_cookie_name();
    let refresh_name = refresh_cookie_name();
    let secure = is_cookie_secure();

    append_set_cookie(
        headers,
        build_set_cookie_value(access_name.as_str(), "", 0, secure),
    );
    append_set_cookie(
        headers,
        build_set_cookie_value(refresh_name.as_str(), "", 0, secure),
    );
}

#[cfg(test)]
mod tests {
    use axum::http::{header::SET_COOKIE, HeaderMap};

    use crate::auth::{AuthUserResponse, TokenResponse};

    use super::{append_access_token_cookie_header, append_auth_set_cookie_headers};

    fn set_cookie_values(headers: &HeaderMap) -> Vec<String> {
        headers
            .get_all(SET_COOKIE)
            .iter()
            .map(|value| value.to_str().expect("valid Set-Cookie").to_string())
            .collect()
    }

    #[test]
    fn access_only_cookie_does_not_rotate_refresh_cookie() {
        let mut headers = HeaderMap::new();

        append_access_token_cookie_header(&mut headers, "read-only-access", "2999-01-01T00:00:00Z");

        let cookies = set_cookie_values(&headers);
        assert_eq!(cookies.len(), 1);
        assert!(cookies[0].contains("aios_access_token=read-only-access"));
        assert!(!cookies[0].contains("aios_refresh_token"));
        assert!(cookies[0].contains("HttpOnly"));
        assert!(cookies[0].contains("SameSite=Lax"));
    }

    #[test]
    fn normal_session_cookie_emission_keeps_access_and_refresh_tokens() {
        let mut headers = HeaderMap::new();
        let tokens = TokenResponse {
            access_token: "normal-access".to_string(),
            refresh_token: "rotated-refresh".to_string(),
            token_type: "bearer".to_string(),
            expires_at: "2999-01-01T00:00:00Z".to_string(),
            refresh_expires_at: "2999-02-01T00:00:00Z".to_string(),
            user: AuthUserResponse {
                id: "user-1".to_string(),
                username: "fixture".to_string(),
                email: "fixture@example.invalid".to_string(),
                full_name: None,
                is_active: true,
                last_login_at: None,
                roles: Vec::new(),
                permissions: Vec::new(),
            },
        };

        append_auth_set_cookie_headers(&mut headers, &tokens);

        let cookies = set_cookie_values(&headers);
        assert_eq!(cookies.len(), 2);
        assert!(cookies
            .iter()
            .any(|value| value.contains("aios_access_token=normal-access")));
        assert!(cookies
            .iter()
            .any(|value| value.contains("aios_refresh_token=rotated-refresh")));
    }
}
