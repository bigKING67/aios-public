mod errors;
mod identity;
mod rbac;
mod user_seed;

use sqlx::PgPool;
use tracing::info;

use crate::error::{AppError, AppResult};

use self::identity::upsert_bd_identity;
use self::rbac::ensure_auth_rbac;
use self::user_seed::{
    ensure_user_role, hash_initial_password, upsert_auth_user, username_for_alias,
};
use super::types::BD_ROLE_CODE;

const MAX_AUTO_CREATED_BD_PER_IMPORT: usize = 50;

#[derive(Debug, Clone)]
pub(super) struct ProvisionedBdOwner {
    pub(super) user_id: String,
    pub(super) display_name: String,
}

pub(super) async fn ensure_import_bd_owner(
    pool: &PgPool,
    owner_alias: &str,
    actor_user_id: &str,
) -> AppResult<ProvisionedBdOwner> {
    let alias = owner_alias.trim();
    if alias.is_empty() {
        return Err(AppError::bad_request("归属BD不能为空"));
    }

    ensure_auth_rbac(pool).await?;
    let username = username_for_alias(alias);
    let password_hash = hash_initial_password()?;
    let user = upsert_auth_user(pool, username.as_str(), alias, password_hash.as_str()).await?;
    ensure_user_role(pool, user.user_id.as_str(), BD_ROLE_CODE).await?;
    upsert_bd_identity(pool, user.user_id.as_str(), username.as_str(), alias, alias).await?;

    info!(
        owner_alias = alias,
        username = username,
        user_id = user.user_id,
        actor_user_id = actor_user_id,
        "auto provisioned creator library BD owner during import"
    );

    Ok(ProvisionedBdOwner {
        user_id: user.user_id,
        display_name: alias.to_string(),
    })
}

pub(super) fn validate_auto_created_bd_count(count: usize) -> AppResult<()> {
    if count > MAX_AUTO_CREATED_BD_PER_IMPORT {
        return Err(AppError::bad_request(format!(
            "单次导入最多自动创建 {} 个新归属BD，请先拆分文件或先初始化BD账号",
            MAX_AUTO_CREATED_BD_PER_IMPORT
        )));
    }
    Ok(())
}
