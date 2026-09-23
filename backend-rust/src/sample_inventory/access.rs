use std::sync::Arc;

use axum::{
    extract::{FromRequestParts, Request, State},
    http::{header, request::Parts, HeaderMap, HeaderValue, Method},
    middleware::Next,
    response::{IntoResponse, Response},
};
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use tracing::warn;
use uuid::Uuid;

use crate::{
    auth::{resolve_optional_current_user, CurrentUser},
    config::SampleInventoryAccessMode,
    error::{AppError, AppResult},
    state::AppState,
};

const ANONYMOUS_COOKIE_NAME: &str = "aios_sample_inventory_actor";
const ANONYMOUS_COOKIE_MAX_AGE_SECONDS: i64 = 365 * 24 * 60 * 60;
const READ_LIMIT_PER_MINUTE: i64 = 300;
const WRITE_LIMIT_PER_MINUTE: i64 = 60;
const SENSITIVE_LIMIT_PER_MINUTE: i64 = 10;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SampleInventoryActorKind {
    Authenticated,
    Anonymous,
}

#[derive(Debug, Clone)]
pub(crate) struct SampleInventoryActor {
    actor_user_id: String,
    kind: SampleInventoryActorKind,
}

impl SampleInventoryActor {
    pub(crate) fn actor_user_id(&self) -> &str {
        self.actor_user_id.as_str()
    }

    fn kind_name(&self) -> &'static str {
        match self.kind {
            SampleInventoryActorKind::Authenticated => "authenticated",
            SampleInventoryActorKind::Anonymous => "anonymous",
        }
    }

    fn authenticated(user_id: String) -> Self {
        Self {
            actor_user_id: user_id,
            kind: SampleInventoryActorKind::Authenticated,
        }
    }

    fn anonymous(actor_id: Uuid) -> Self {
        Self {
            actor_user_id: format!("anonymous:{actor_id}"),
            kind: SampleInventoryActorKind::Anonymous,
        }
    }
}

impl<S> FromRequestParts<S> for SampleInventoryActor
where
    S: Send + Sync,
{
    type Rejection = AppError;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let actor = parts.extensions.get::<Self>().cloned();
        async move { actor.ok_or(AppError::Internal) }
    }
}

pub(crate) async fn enforce_sample_inventory_access(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let (actor, set_cookie) = match resolve_actor(&state, request.headers()).await {
        Ok(result) => result,
        Err(error) => return error.into_response(),
    };

    let access_result = if is_safe_method(request.method()) {
        enforce_rate_limit(&state, &actor, request.method(), request.uri().path()).await
    } else {
        match validate_mutation_origin(&state.settings.cors_origins, request.headers()) {
            Ok(()) => {
                enforce_rate_limit(&state, &actor, request.method(), request.uri().path()).await
            }
            Err(error) => Err(error),
        }
    };

    let mut response = match access_result {
        Ok(()) => {
            request.extensions_mut().insert(actor);
            next.run(request).await
        }
        Err(error) => error.into_response(),
    };

    if let Some(cookie) = set_cookie {
        if let Ok(value) = HeaderValue::from_str(cookie.as_str()) {
            response.headers_mut().append(header::SET_COOKIE, value);
        }
    }

    response
}

async fn resolve_actor(
    state: &AppState,
    headers: &HeaderMap,
) -> AppResult<(SampleInventoryActor, Option<String>)> {
    resolve_actor_after_auth(
        resolve_optional_current_user(headers, state).await?,
        state.settings.sample_inventory_access_mode,
        headers,
        &state.settings.secret_key,
    )
}

fn resolve_actor_after_auth(
    user: Option<CurrentUser>,
    access_mode: SampleInventoryAccessMode,
    headers: &HeaderMap,
    secret_key: &str,
) -> AppResult<(SampleInventoryActor, Option<String>)> {
    if let Some(user) = user {
        return Ok((SampleInventoryActor::authenticated(user.user_id), None));
    }

    if access_mode == SampleInventoryAccessMode::Authenticated {
        return Err(AppError::Unauthorized);
    }

    if let Some(actor_id) = extract_valid_anonymous_actor(headers, secret_key) {
        return Ok((SampleInventoryActor::anonymous(actor_id), None));
    }

    let actor_id = Uuid::new_v4();
    Ok((
        SampleInventoryActor::anonymous(actor_id),
        Some(build_anonymous_cookie(actor_id, secret_key)),
    ))
}

fn validate_mutation_origin(allowed_origins: &[String], headers: &HeaderMap) -> AppResult<()> {
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(AppError::Forbidden)?;

    if allowed_origins
        .iter()
        .any(|allowed| allowed.trim() == origin)
    {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

async fn enforce_rate_limit(
    state: &AppState,
    actor: &SampleInventoryActor,
    method: &Method,
    path: &str,
) -> AppResult<()> {
    let (category, limit) = rate_limit_category(method, path);
    let minute_bucket = Utc::now().timestamp() / 60;
    let actor_hash = hash_actor_for_cache(actor.actor_user_id(), &state.settings.secret_key);
    let key = format!("rl:sample-inventory:{category}:{actor_hash}:{minute_bucket}");
    let mut connection = state.dragonfly_connection.clone();

    let count: i64 = match dragonfly_client::cmd("INCR")
        .arg(key.as_str())
        .query_async(&mut connection)
        .await
    {
        Ok(value) => value,
        Err(error) => {
            warn!(
                ?error,
                category,
                actor_kind = actor.kind_name(),
                "sample inventory rate limiter unavailable"
            );
            return if is_safe_method(method) {
                Ok(())
            } else {
                Err(AppError::ServiceUnavailable(
                    "样品库存写入保护暂不可用，请稍后重试".to_string(),
                ))
            };
        }
    };

    if count == 1 {
        if let Err(error) = dragonfly_client::cmd("EXPIRE")
            .arg(key.as_str())
            .arg(90)
            .query_async::<()>(&mut connection)
            .await
        {
            warn!(
                ?error,
                category, "sample inventory rate limiter expiry failed"
            );
        }
    }

    if count > limit {
        return Err(AppError::TooManyRequests);
    }
    Ok(())
}

fn rate_limit_category(method: &Method, path: &str) -> (&'static str, i64) {
    if is_safe_method(method) {
        if path.contains("/export") || path.ends_with("/backup.json") {
            ("sensitive-read", SENSITIVE_LIMIT_PER_MINUTE)
        } else {
            ("read", READ_LIMIT_PER_MINUTE)
        }
    } else if path.contains("/import")
        || path.contains("/backup/")
        || path.contains("batch-archive")
        || path.contains("batch-void")
        || path.ends_with("/settings")
    {
        ("sensitive-write", SENSITIVE_LIMIT_PER_MINUTE)
    } else {
        ("write", WRITE_LIMIT_PER_MINUTE)
    }
}

fn is_safe_method(method: &Method) -> bool {
    matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

fn hash_actor_for_cache(actor_user_id: &str, secret: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(secret.as_bytes());
    digest.update(b":sample-inventory-rate-limit:");
    digest.update(actor_user_id.as_bytes());
    hex::encode(digest.finalize())
}

fn extract_cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        (key.trim() == name && !value.trim().is_empty()).then(|| value.trim().to_string())
    })
}

fn extract_valid_anonymous_actor(headers: &HeaderMap, secret: &str) -> Option<Uuid> {
    let raw = extract_cookie_value(headers, ANONYMOUS_COOKIE_NAME)?;
    let (actor_id, signature) = raw.split_once('.')?;
    let actor_id = Uuid::parse_str(actor_id).ok()?;
    let signature = hex::decode(signature).ok()?;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(actor_id.to_string().as_bytes());
    mac.verify_slice(&signature).ok()?;
    Some(actor_id)
}

fn build_anonymous_cookie(actor_id: Uuid, secret: &str) -> String {
    let actor_id = actor_id.to_string();
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC accepts arbitrary secret lengths");
    mac.update(actor_id.as_bytes());
    let value = format!("{actor_id}.{}", hex::encode(mac.finalize().into_bytes()));
    let mut cookie = format!(
        "{ANONYMOUS_COOKIE_NAME}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={ANONYMOUS_COOKIE_MAX_AGE_SECONDS}"
    );
    if is_production() {
        cookie.push_str("; Secure");
    }
    cookie
}

fn is_production() -> bool {
    std::env::var("NODE_ENV")
        .ok()
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("production"))
}

#[cfg(test)]
mod tests {
    use axum::http::{header, HeaderMap, HeaderValue, Method};
    use uuid::Uuid;

    use crate::{auth::CurrentUser, config::SampleInventoryAccessMode, error::AppError};

    use super::{
        build_anonymous_cookie, extract_valid_anonymous_actor, rate_limit_category,
        resolve_actor_after_auth, validate_mutation_origin, SampleInventoryActorKind,
        SENSITIVE_LIMIT_PER_MINUTE,
    };

    fn authenticated_user() -> CurrentUser {
        CurrentUser {
            user_id: "user-001".to_string(),
            username: Some("operator".to_string()),
            roles: Vec::new(),
            permissions: Vec::new(),
        }
    }

    #[test]
    fn public_mode_issues_anonymous_actor_but_prefers_valid_user() {
        let headers = HeaderMap::new();
        let (anonymous, set_cookie) = resolve_actor_after_auth(
            None,
            SampleInventoryAccessMode::Public,
            &headers,
            "test-secret",
        )
        .expect("public mode should issue an anonymous actor");
        assert_eq!(anonymous.kind, SampleInventoryActorKind::Anonymous);
        assert!(anonymous.actor_user_id().starts_with("anonymous:"));
        assert!(set_cookie.is_some());

        let (authenticated, set_cookie) = resolve_actor_after_auth(
            Some(authenticated_user()),
            SampleInventoryAccessMode::Public,
            &headers,
            "test-secret",
        )
        .expect("valid users should remain authenticated actors");
        assert_eq!(authenticated.kind, SampleInventoryActorKind::Authenticated);
        assert_eq!(authenticated.actor_user_id(), "user-001");
        assert!(set_cookie.is_none());
    }

    #[test]
    fn authenticated_mode_rejects_missing_user() {
        let error = resolve_actor_after_auth(
            None,
            SampleInventoryAccessMode::Authenticated,
            &HeaderMap::new(),
            "test-secret",
        )
        .expect_err("authenticated mode must fail closed");
        assert!(matches!(error, AppError::Unauthorized));
    }

    #[test]
    fn mutation_origin_must_exactly_match_an_allowed_origin() {
        let allowed = vec!["https://aios.example.test".to_string()];
        let mut headers = HeaderMap::new();
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://aios.example.test"),
        );
        assert!(validate_mutation_origin(&allowed, &headers).is_ok());

        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://other.example.test"),
        );
        assert!(matches!(
            validate_mutation_origin(&allowed, &headers),
            Err(AppError::Forbidden)
        ));
        assert!(matches!(
            validate_mutation_origin(&allowed, &HeaderMap::new()),
            Err(AppError::Forbidden)
        ));
    }

    #[test]
    fn signed_anonymous_cookie_round_trips_and_rejects_tampering() {
        let actor_id = Uuid::new_v4();
        let cookie = build_anonymous_cookie(actor_id, "test-secret");
        let cookie_pair = cookie.split(';').next().expect("cookie pair");
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_str(cookie_pair).expect("header"),
        );
        assert_eq!(
            extract_valid_anonymous_actor(&headers, "test-secret"),
            Some(actor_id)
        );
        assert_eq!(
            extract_valid_anonymous_actor(&headers, "other-secret"),
            None
        );

        let (rotated_actor, rotated_cookie) = resolve_actor_after_auth(
            None,
            SampleInventoryAccessMode::Public,
            &headers,
            "other-secret",
        )
        .expect("tampered cookie should rotate in public mode");
        assert_eq!(rotated_actor.kind, SampleInventoryActorKind::Anonymous);
        assert!(rotated_cookie.is_some());
    }

    #[test]
    fn high_impact_routes_use_sensitive_limit() {
        assert_eq!(
            rate_limit_category(&Method::POST, "/sample-inventory/backup/restore"),
            ("sensitive-write", SENSITIVE_LIMIT_PER_MINUTE)
        );
        assert_eq!(
            rate_limit_category(&Method::GET, "/sample-inventory/backup.json"),
            ("sensitive-read", SENSITIVE_LIMIT_PER_MINUTE)
        );
    }
}
