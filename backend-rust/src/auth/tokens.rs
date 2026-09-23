use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(super) struct TokenClaims {
    pub(super) sub: String,
    pub(super) typ: String,
    pub(super) exp: usize,
    pub(super) iat: usize,
    pub(super) jti: String,
    pub(super) username: Option<String>,
    pub(super) roles: Vec<String>,
    pub(super) permissions: Vec<String>,
}

pub(crate) fn create_token(
    secret_key: &str,
    user_id: &str,
    token_type: &str,
    expires_at: DateTime<Utc>,
    username: Option<String>,
    roles: Vec<String>,
    permissions: Vec<String>,
) -> AppResult<String> {
    let claims = TokenClaims {
        sub: user_id.to_string(),
        typ: token_type.to_string(),
        exp: expires_at.timestamp() as usize,
        iat: Utc::now().timestamp() as usize,
        jti: Uuid::new_v4().to_string(),
        username,
        roles,
        permissions,
    };

    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret_key.as_bytes()),
    )
    .map_err(|error| {
        tracing::error!(?error, "failed to encode jwt");
        AppError::Internal
    })
}

pub(super) fn decode_token(
    token: &str,
    secret_key: &str,
    expected_type: &str,
) -> AppResult<TokenClaims> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let token_data = decode::<TokenClaims>(
        token,
        &DecodingKey::from_secret(secret_key.as_bytes()),
        &validation,
    )
    .map_err(|_| AppError::Unauthorized)?;

    let claims = token_data.claims;
    if claims.typ != expected_type {
        return Err(AppError::Unauthorized);
    }

    Ok(claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_and_decode_token_round_trip() {
        let token = create_token(
            "test-secret",
            "user-1",
            "access",
            Utc::now() + chrono::Duration::minutes(10),
            Some("alice".to_string()),
            vec!["admin".to_string()],
            vec!["reports:read".to_string()],
        )
        .expect("token should be created");

        let claims =
            decode_token(token.as_str(), "test-secret", "access").expect("token should decode");

        assert_eq!(claims.sub, "user-1");
        assert_eq!(claims.typ, "access");
        assert_eq!(claims.username.as_deref(), Some("alice"));
        assert_eq!(claims.roles, vec!["admin"]);
        assert_eq!(claims.permissions, vec!["reports:read"]);
    }

    #[test]
    fn decode_token_rejects_wrong_type() {
        let token = create_token(
            "test-secret",
            "user-1",
            "refresh",
            Utc::now() + chrono::Duration::minutes(10),
            None,
            vec![],
            vec![],
        )
        .expect("token should be created");

        let result = decode_token(token.as_str(), "test-secret", "access");
        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn retired_agent_tokens_do_not_become_console_credentials() {
        let token = create_token(
            "test-secret",
            "former-device",
            "agent_access",
            Utc::now() + chrono::Duration::minutes(10),
            None,
            vec!["agent_desktop".to_string()],
            vec!["agent:read".to_string()],
        )
        .expect("synthetic retired token");
        for audience in ["access", "refresh"] {
            assert!(matches!(
                decode_token(&token, "test-secret", audience),
                Err(AppError::Unauthorized)
            ));
        }
    }
}
