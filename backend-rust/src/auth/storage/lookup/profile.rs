use sqlx::PgPool;

use crate::error::AppResult;

use super::super::super::AuthUserResponse;
use super::by_id::fetch_user_by_id;

pub(crate) async fn fetch_user_profile(
    pool: &PgPool,
    user_id: &str,
) -> AppResult<Option<AuthUserResponse>> {
    let user = fetch_user_by_id(pool, user_id).await?;

    let Some(user) = user else {
        return Ok(None);
    };

    let roles = super::super::fetch_user_roles(pool, user_id).await?;
    let permissions = super::super::fetch_user_permissions(pool, user_id).await?;

    Ok(Some(AuthUserResponse {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        is_active: user.is_active,
        last_login_at: user.last_login_at.map(|value| value.to_rfc3339()),
        roles,
        permissions,
    }))
}
