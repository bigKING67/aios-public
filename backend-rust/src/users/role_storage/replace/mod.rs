mod auth;
mod legacy;
mod ods;

use sqlx::PgPool;

use crate::error::AppResult;

use super::super::storage::UserStorage;

pub(crate) async fn replace_user_roles_by_storage(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
    role_ids: &[String],
    actor_user_id: Option<i64>,
) -> AppResult<()> {
    match storage {
        UserStorage::Auth => auth::replace_auth_user_roles(pool, user_id, role_ids).await,
        UserStorage::Legacy => {
            legacy::replace_legacy_user_roles(pool, user_id, role_ids, actor_user_id).await
        }
        UserStorage::Ods => {
            ods::replace_ods_user_roles(pool, user_id, role_ids, actor_user_id).await
        }
    }
}
