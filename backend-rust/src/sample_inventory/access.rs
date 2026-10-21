use std::sync::Arc;

use axum::{
    extract::{FromRequestParts, Request, State},
    http::{request::Parts, HeaderMap, Method},
    middleware::Next,
    response::{IntoResponse, Response},
};
use chrono::Utc;
use sha2::{Digest, Sha256};
use tracing::warn;

use crate::{
    auth::{resolve_optional_current_user, CurrentUser},
    cors::validate_mutation_origin,
    error::{AppError, AppResult},
    rate_limit::increment_window,
    state::AppState,
};

const READ_LIMIT_PER_MINUTE: i64 = 300;
const WRITE_LIMIT_PER_MINUTE: i64 = 60;
const SENSITIVE_LIMIT_PER_MINUTE: i64 = 10;

#[derive(Debug, Clone)]
pub(crate) struct SampleInventoryActor {
    actor_user_id: String,
}

impl SampleInventoryActor {
    pub(crate) fn actor_user_id(&self) -> &str {
        self.actor_user_id.as_str()
    }

    fn authenticated(user: CurrentUser) -> Self {
        Self {
            actor_user_id: user.user_id,
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
    let actor = match resolve_actor(&state, request.headers()).await {
        Ok(actor) => actor,
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

    match access_result {
        Ok(()) => {
            request.extensions_mut().insert(actor);
            next.run(request).await
        }
        Err(error) => error.into_response(),
    }
}

async fn resolve_actor(state: &AppState, headers: &HeaderMap) -> AppResult<SampleInventoryActor> {
    resolve_actor_after_auth(resolve_optional_current_user(headers, state).await?)
}

fn resolve_actor_after_auth(user: Option<CurrentUser>) -> AppResult<SampleInventoryActor> {
    user.map(SampleInventoryActor::authenticated)
        .ok_or(AppError::Unauthorized)
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
    let count = match increment_window(state, &key, 90).await {
        Ok(value) => value,
        Err(error) => {
            warn!(
                ?error,
                category, "sample inventory rate limiter unavailable"
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

#[cfg(test)]
mod tests {
    use axum::http::{header, HeaderMap, HeaderValue, Method};

    use crate::{auth::CurrentUser, error::AppError};

    use super::{
        rate_limit_category, resolve_actor_after_auth, validate_mutation_origin,
        SENSITIVE_LIMIT_PER_MINUTE,
    };

    #[test]
    fn authenticated_user_becomes_actor() {
        let actor = resolve_actor_after_auth(Some(CurrentUser {
            user_id: "user-001".to_string(),
            username: Some("operator".to_string()),
            roles: Vec::new(),
            permissions: Vec::new(),
        }))
        .expect("valid users should resolve to an actor");
        assert_eq!(actor.actor_user_id(), "user-001");
    }

    #[test]
    fn missing_user_is_rejected() {
        let error = resolve_actor_after_auth(None).expect_err("anonymous access must fail closed");
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
