mod auth;
mod legacy;
mod ods;

use sqlx::PgPool;

use crate::error::AppResult;

use super::super::storage::RoleStorage;

pub(in crate::roles) async fn replace_role_permissions_by_storage(
    pool: &PgPool,
    storage: RoleStorage,
    role_id: &str,
    permission_ids: &[i64],
    actor_user_id: Option<i64>,
) -> AppResult<()> {
    match storage {
        RoleStorage::Auth => {
            auth::replace_auth_role_permissions(pool, role_id, permission_ids).await
        }
        RoleStorage::Legacy => {
            legacy::replace_legacy_role_permissions(pool, role_id, permission_ids, actor_user_id)
                .await
        }
        RoleStorage::Ods => {
            ods::replace_ods_role_permissions(pool, role_id, permission_ids, actor_user_id).await
        }
    }
}
