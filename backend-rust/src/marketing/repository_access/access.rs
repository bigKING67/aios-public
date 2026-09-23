use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::types::CreatorLibraryActor;

#[derive(Debug, Clone)]
pub(in crate::marketing) struct CreatorRecordAccess {
    pub(in crate::marketing) created_by_user_id: Option<String>,
    pub(in crate::marketing) owner_user_id: Option<String>,
}

impl CreatorRecordAccess {
    pub(in crate::marketing) fn can_edit(&self, actor: &CreatorLibraryActor) -> bool {
        if actor.can_manage {
            return true;
        }
        if self.created_by_user_id.as_deref() == Some(actor.user_id.as_str()) {
            return true;
        }
        if self.owner_user_id.as_deref() == Some(actor.user_id.as_str()) {
            return true;
        }
        false
    }

    pub(in crate::marketing) fn can_delete(&self, actor: &CreatorLibraryActor) -> bool {
        if actor.can_manage {
            return true;
        }
        if self.created_by_user_id.as_deref() == Some(actor.user_id.as_str()) {
            return true;
        }
        if self.owner_user_id.as_deref() == Some(actor.user_id.as_str()) {
            return true;
        }
        false
    }
}

pub(in crate::marketing) async fn ensure_can_edit_creator(
    pool: &PgPool,
    id: i64,
    actor: &CreatorLibraryActor,
) -> AppResult<CreatorRecordAccess> {
    let access = fetch_creator_record_access(pool, id).await?;
    match access {
        None => Err(AppError::NotFound),
        Some(access) if access.can_edit(actor) => Ok(access),
        Some(_) => Err(AppError::Forbidden),
    }
}

pub(in crate::marketing) async fn ensure_can_delete_creator(
    pool: &PgPool,
    id: i64,
    actor: &CreatorLibraryActor,
) -> AppResult<CreatorRecordAccess> {
    let access = fetch_creator_record_access(pool, id).await?;
    match access {
        None => Err(AppError::NotFound),
        Some(access) if access.can_delete(actor) => Ok(access),
        Some(_) => Err(AppError::Forbidden),
    }
}

pub(in crate::marketing) async fn fetch_creator_record_access(
    pool: &PgPool,
    id: i64,
) -> AppResult<Option<CreatorRecordAccess>> {
    let row = sqlx::query(
        r#"
        SELECT created_by_user_id, owner_user_id
        FROM ads.influencer_library
        WHERE id = $1
          AND is_deleted = FALSE
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        error!(?error, id, "fetch influencer library access fields failed");
        AppError::Internal
    })?;

    Ok(row.map(|item| CreatorRecordAccess {
        created_by_user_id: item.try_get("created_by_user_id").ok().flatten(),
        owner_user_id: item.try_get("owner_user_id").ok().flatten(),
    }))
}
