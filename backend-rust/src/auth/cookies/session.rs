use super::super::{AuthUserResponse, SessionUserResponse};

pub(in crate::auth) fn build_session_user(
    profile: &AuthUserResponse,
    fallback_username: Option<&str>,
) -> SessionUserResponse {
    let normalized_username = profile.username.trim().to_string();
    let username = if normalized_username.is_empty() {
        fallback_username.unwrap_or_default().to_string()
    } else {
        normalized_username
    };

    SessionUserResponse {
        id: if profile.id.trim().is_empty() {
            username.clone()
        } else {
            profile.id.clone()
        },
        username,
        email: profile.email.trim().to_string(),
        full_name: profile.full_name.clone(),
        roles: profile.roles.clone(),
        is_active: profile.is_active,
    }
}
