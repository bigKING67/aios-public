use sqlx::PgPool;

use crate::error::{AppError, AppResult};

use super::{
    super::{
        bd_accounts::ensure_import_bd_owner,
        types::{CreatorLibraryActor, CreatorLibraryInput},
    },
    bd_users::{fetch_bd_identity_by_alias, fetch_bd_identity_by_user_id},
};

#[derive(Debug, Clone)]
pub(in crate::marketing) struct ResolvedCreatorOwner {
    pub(in crate::marketing) user_id: Option<String>,
    pub(in crate::marketing) display_name: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub(in crate::marketing) enum OwnerResolutionMode {
    Strict,
    AutoCreateForImport,
}

pub(in crate::marketing) async fn resolve_creator_owner(
    pool: &PgPool,
    input: &CreatorLibraryInput,
    actor: &CreatorLibraryActor,
    allow_self_fallback: bool,
    mode: OwnerResolutionMode,
) -> AppResult<ResolvedCreatorOwner> {
    let explicit_user_id = input
        .owner_user_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let owner_name = input
        .owner_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(user_id) = explicit_user_id {
        let Some(identity) = fetch_bd_identity_by_user_id(pool, user_id).await? else {
            return Err(AppError::bad_request("归属BD账号不存在或未绑定BD身份"));
        };
        return Ok(ResolvedCreatorOwner {
            user_id: Some(identity.user_id),
            display_name: Some(identity.display_name),
        });
    }

    if let Some(alias) = owner_name {
        if allow_self_fallback
            && (alias == actor.display_name || alias.eq_ignore_ascii_case(actor.user_id.as_str()))
        {
            return Ok(ResolvedCreatorOwner {
                user_id: Some(actor.user_id.clone()),
                display_name: Some(actor.display_name.clone()),
            });
        }

        let identity = match fetch_bd_identity_by_alias(pool, alias).await? {
            Some(identity) => identity,
            None if matches!(mode, OwnerResolutionMode::AutoCreateForImport) => {
                let owner = ensure_import_bd_owner(pool, alias, actor.user_id.as_str()).await?;
                return Ok(ResolvedCreatorOwner {
                    user_id: Some(owner.user_id),
                    display_name: Some(owner.display_name),
                });
            }
            None => {
                return Err(AppError::bad_request(format!(
                    "归属BD「{}」未绑定账号，请先完成BD账号初始化",
                    alias
                )));
            }
        };
        return Ok(ResolvedCreatorOwner {
            user_id: Some(identity.user_id),
            display_name: Some(identity.display_name),
        });
    }

    if allow_self_fallback && actor.is_bd {
        if let Some(identity) = fetch_bd_identity_by_user_id(pool, actor.user_id.as_str()).await? {
            return Ok(ResolvedCreatorOwner {
                user_id: Some(identity.user_id),
                display_name: Some(identity.display_name),
            });
        }

        return Ok(ResolvedCreatorOwner {
            user_id: Some(actor.user_id.clone()),
            display_name: Some(actor.display_name.clone()),
        });
    }

    Ok(ResolvedCreatorOwner {
        user_id: None,
        display_name: None,
    })
}
