mod auth;
mod simple;

use sqlx::PgPool;

use crate::error::AppResult;

use super::super::types::UserStorage;

pub(crate) async fn soft_delete_user_by_storage(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
) -> AppResult<bool> {
    let deleted = match storage {
        UserStorage::Auth => auth::soft_delete_auth_user(pool, storage, user_id).await?,
        UserStorage::Legacy => simple::soft_delete_legacy_user(pool, storage, user_id).await?,
        UserStorage::Ods => simple::soft_delete_ods_user(pool, storage, user_id).await?,
    };

    Ok(deleted)
}
