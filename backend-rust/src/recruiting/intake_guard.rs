//! Abuse protection for the anonymous submission endpoint: a salted client IP
//! hash plus a per-IP hourly Dragonfly counter. There is deliberately no
//! site-wide cap: a few IPs could exhaust it and lock every real candidate
//! out. The limiter fails closed because this is the only anonymous write.
use axum::http::HeaderMap;
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use tracing::warn;

use crate::{
    error::{AppError, AppResult},
    rate_limit::increment_window,
    state::AppState,
};

const PER_IP_PER_HOUR: i64 = 5;

/// Production Traefik connects directly (no trusted forwarders configured),
/// so it replaces any client-sent X-Forwarded-For with the real peer; the
/// right-most entry is the address Traefik saw.
pub(super) fn client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.rsplit(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

pub(super) fn hash_client_ip(ip: &str, secret: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(secret.as_bytes());
    digest.update(b":recruiting-client-ip:");
    digest.update(ip.as_bytes());
    hex::encode(digest.finalize())
}

/// Charged only for submissions that passed validation, so typos and stale
/// pages do not use up a shared campus/office IP's quota.
pub(super) async fn enforce_submission_limit(
    state: &AppState,
    ip_hash: &str,
    now: DateTime<Utc>,
) -> AppResult<()> {
    let key = format!("rl:recruiting:ip:{ip_hash}:{}", now.format("%Y%m%d%H"));
    let count = increment_window(state, &key, 3_700)
        .await
        .map_err(|error| {
            warn!(?error, "recruiting submission limiter unavailable");
            AppError::ServiceUnavailable("提交保护暂不可用，请稍后重试，已填写内容会保留".into())
        })?;
    if count > PER_IP_PER_HOUR {
        return Err(AppError::TooManyRequests);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use axum::http::{HeaderMap, HeaderValue};

    use super::{client_ip, hash_client_ip};

    #[test]
    fn client_ip_uses_right_most_forwarded_entry() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("1.1.1.1, 203.0.113.9"),
        );
        assert_eq!(client_ip(&headers), "203.0.113.9");
    }

    #[test]
    fn client_ip_falls_back_when_header_missing() {
        assert_eq!(client_ip(&HeaderMap::new()), "unknown");
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static(" "));
        assert_eq!(client_ip(&headers), "unknown");
    }

    #[test]
    fn ip_hash_is_salted_and_stable() {
        let first = hash_client_ip("203.0.113.9", "secret-a");
        assert_eq!(first, hash_client_ip("203.0.113.9", "secret-a"));
        assert_ne!(first, hash_client_ip("203.0.113.9", "secret-b"));
        assert!(!first.contains("203.0.113.9"));
    }
}
