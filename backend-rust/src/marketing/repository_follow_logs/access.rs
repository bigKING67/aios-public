use sqlx::{PgPool, Postgres, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

pub(super) async fn ensure_creator_exists(
    pool: &PgPool,
    influencer_library_id: i64,
) -> AppResult<()> {
    let row = sqlx::query(
        r#"
        SELECT 1
        FROM ads.influencer_library
        WHERE id = $1
          AND is_deleted = FALSE
        "#,
    )
    .bind(influencer_library_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        error!(
            ?error,
            influencer_library_id, "check influencer library item existence failed"
        );
        AppError::Internal
    })?;

    if row.is_some() {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

pub(super) async fn ensure_can_edit_follow_log(
    pool: &PgPool,
    influencer_library_id: i64,
    follow_log_id: i64,
    actor_user_id: &str,
    can_manage: bool,
) -> AppResult<()> {
    let Some(access) =
        fetch_follow_log_record_access(pool, influencer_library_id, follow_log_id).await?
    else {
        return Err(AppError::NotFound);
    };

    if access.can_edit(actor_user_id, can_manage) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub(super) struct FollowLogRecordAccess {
    created_by_user_id: Option<String>,
    creator_created_by_user_id: Option<String>,
    creator_owner_user_id: Option<String>,
}

impl FollowLogRecordAccess {
    pub(super) fn can_edit(&self, actor_user_id: &str, can_manage: bool) -> bool {
        if can_manage {
            return true;
        }
        if self.created_by_user_id.as_deref() == Some(actor_user_id) {
            return true;
        }
        if self.creator_owner_user_id.as_deref() == Some(actor_user_id) {
            return true;
        }
        self.creator_created_by_user_id.as_deref() == Some(actor_user_id)
    }
}

pub(super) async fn fetch_follow_log_record_access(
    pool: &PgPool,
    influencer_library_id: i64,
    follow_log_id: i64,
) -> AppResult<Option<FollowLogRecordAccess>> {
    ensure_creator_exists(pool, influencer_library_id).await?;

    let row = sqlx::query(
        r#"
        SELECT
          follow_log.created_by_user_id,
          library.created_by_user_id AS creator_created_by_user_id,
          library.owner_user_id AS creator_owner_user_id
        FROM ads.influencer_library_follow_log AS follow_log
        JOIN ads.influencer_library AS library
          ON library.id = follow_log.influencer_library_id
         AND library.is_deleted = FALSE
        WHERE follow_log.id = $2
          AND follow_log.influencer_library_id = $1
          AND follow_log.is_deleted = FALSE
        "#,
    )
    .bind(influencer_library_id)
    .bind(follow_log_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        error!(
            ?error,
            influencer_library_id,
            follow_log_id,
            "fetch influencer library follow log access failed"
        );
        AppError::Internal
    })?;

    Ok(row.as_ref().map(|row| FollowLogRecordAccess {
        created_by_user_id: row.try_get("created_by_user_id").ok().flatten(),
        creator_created_by_user_id: row.try_get("creator_created_by_user_id").ok().flatten(),
        creator_owner_user_id: row.try_get("creator_owner_user_id").ok().flatten(),
    }))
}

pub(super) async fn lock_creator_for_follow_mutation(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    influencer_library_id: i64,
) -> AppResult<()> {
    let row = sqlx::query(
        r#"
        SELECT id
        FROM ads.influencer_library
        WHERE id = $1
          AND is_deleted = FALSE
        FOR UPDATE
        "#,
    )
    .bind(influencer_library_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| {
        error!(
            ?error,
            influencer_library_id, "lock influencer library item for follow mutation failed"
        );
        AppError::Internal
    })?;

    if row.is_some() {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}
