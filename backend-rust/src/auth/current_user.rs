use std::sync::Arc;

use axum::{
    extract::{FromRef, FromRequestParts},
    http::{request::Parts, HeaderMap},
};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

use super::{cookies::extract_access_token_from_headers, storage::fetch_user_profile};
use super::{tokens::decode_token, ACCESS_TOKEN_TYPE};

#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub user_id: String,
    pub username: Option<String>,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

const DEFAULT_SUPER_ADMIN_IDENTIFIERS: [&str; 0] = [];

fn normalize_role_code(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .chars()
        .map(|char| {
            if char.is_whitespace() || char == '-' {
                '_'
            } else {
                char
            }
        })
        .collect()
}

fn normalize_identity(raw: &str) -> String {
    raw.trim().to_lowercase()
}

fn configured_super_admin_identifiers() -> Vec<String> {
    let mut identifiers = DEFAULT_SUPER_ADMIN_IDENTIFIERS
        .iter()
        .map(|value| normalize_identity(value))
        .collect::<Vec<_>>();

    if let Ok(raw_value) = std::env::var("SUPER_ADMIN_ACCOUNTS") {
        identifiers.extend(
            raw_value
                .split(',')
                .map(normalize_identity)
                .filter(|value| !value.is_empty()),
        );
    }

    identifiers.sort();
    identifiers.dedup();
    identifiers
}

impl CurrentUser {
    pub fn has_role(&self, target: &str) -> bool {
        let target = normalize_role_code(target);
        if target.is_empty() {
            return false;
        }

        self.roles
            .iter()
            .map(|role| normalize_role_code(role.as_str()))
            .any(|role| role == target)
    }

    pub fn has_any_role(&self, candidates: &[&str]) -> bool {
        candidates.iter().any(|candidate| self.has_role(candidate))
    }

    pub fn has_permission(&self, target: &str) -> bool {
        if target.trim().is_empty() {
            return false;
        }

        if self.is_admin() {
            return true;
        }

        self.permissions
            .iter()
            .any(|permission| permission == target)
    }

    pub fn is_super_admin(&self) -> bool {
        if self.has_any_role(&["super_admin", "superadmin"]) {
            return true;
        }

        let username = self
            .username
            .as_deref()
            .map(normalize_identity)
            .unwrap_or_default();
        if username.is_empty() {
            return false;
        }

        configured_super_admin_identifiers()
            .iter()
            .any(|identifier| identifier == &username)
    }

    pub fn is_admin(&self) -> bool {
        self.is_super_admin() || self.has_role("admin")
    }
}

pub fn ensure_any_permission(user: &CurrentUser, required: &[&str]) -> AppResult<()> {
    if user.is_admin() {
        return Ok(());
    }

    if required.iter().any(|code| user.has_permission(code)) {
        return Ok(());
    }

    Err(AppError::Forbidden)
}

impl<S> FromRequestParts<S> for CurrentUser
where
    Arc<AppState>: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let app_state = Arc::<AppState>::from_ref(state);
        let headers = parts.headers.clone();

        async move {
            resolve_optional_current_user(&headers, &app_state)
                .await?
                .ok_or(AppError::Unauthorized)
        }
    }
}

pub(crate) async fn resolve_optional_current_user(
    headers: &HeaderMap,
    app_state: &AppState,
) -> AppResult<Option<CurrentUser>> {
    let Some(token) = extract_access_token_from_headers(headers) else {
        return Ok(None);
    };

    let claims = match decode_token(
        token.as_str(),
        &app_state.settings.secret_key,
        ACCESS_TOKEN_TYPE,
    ) {
        Ok(claims) => claims,
        Err(AppError::Unauthorized) => return Ok(None),
        Err(error) => return Err(error),
    };

    let Some(profile) = fetch_user_profile(&app_state.pool, claims.sub.as_str()).await? else {
        return Ok(None);
    };
    if !profile.is_active {
        return Ok(None);
    }

    let username = if profile.username.trim().is_empty() {
        claims.username
    } else {
        Some(profile.username.clone())
    };

    Ok(Some(CurrentUser {
        user_id: profile.id,
        username,
        roles: profile.roles,
        permissions: profile.permissions,
    }))
}

#[cfg(test)]
mod tests {
    use super::{ensure_any_permission, CurrentUser};

    fn user(username: Option<&str>, roles: &[&str], permissions: &[&str]) -> CurrentUser {
        CurrentUser {
            user_id: "user-001".to_string(),
            username: username.map(str::to_string),
            roles: roles.iter().map(|value| (*value).to_string()).collect(),
            permissions: permissions
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
        }
    }

    #[test]
    fn role_matching_normalizes_case_space_and_hyphen() {
        let current_user = user(None, &["Super Admin", "content-ops"], &[]);

        assert!(current_user.has_role("super_admin"));
        assert!(current_user.has_role("super-admin"));
        assert!(current_user.has_role("content_ops"));
        assert!(!current_user.has_role("contentops"));
    }

    #[test]
    fn no_default_identity_is_super_admin_without_role() {
        let current_user = user(Some("operator"), &[], &[]);

        assert!(!current_user.is_super_admin());
        assert!(!current_user.is_admin());
        assert!(ensure_any_permission(&current_user, &["role:list:all"]).is_err());
    }

    #[test]
    fn admin_role_is_elevated_for_permission_checks() {
        let current_user = user(Some("operator"), &["admin"], &[]);

        assert!(!current_user.is_super_admin());
        assert!(current_user.is_admin());
        assert!(current_user.has_permission("any:permission:code"));
    }
}
