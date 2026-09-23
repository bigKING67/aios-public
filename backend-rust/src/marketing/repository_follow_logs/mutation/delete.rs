use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};
use crate::marketing::types::CreatorLibraryActor;

use super::{
    super::{
        access::{ensure_can_edit_follow_log, lock_creator_for_follow_mutation},
        snapshot::refresh_creator_follow_snapshot_in_tx,
    },
    conflict::resolve_stale_follow_log_error,
};

pub(in crate::marketing) async fn delete_follow_log_by_id(
    pool: &PgPool,
    influencer_library_id: i64,
    follow_log_id: i64,
    expected_updated_at: Option<&str>,
    actor: &CreatorLibraryActor,
    can_manage: bool,
) -> AppResult<()> {
    ensure_can_edit_follow_log(
        pool,
        influencer_library_id,
        follow_log_id,
        actor.user_id.as_str(),
        can_manage,
    )
    .await?;
    if expected_updated_at.is_none() {
        return Err(AppError::bad_request("缺少版本字段，请刷新后再删除。"));
    }

    let mut tx = pool.begin().await.map_err(|error| {
        error!(
            ?error,
            influencer_library_id, follow_log_id, "begin delete follow log transaction failed"
        );
        AppError::Internal
    })?;
    lock_creator_for_follow_mutation(&mut tx, influencer_library_id).await?;

    let result = sqlx::query(
        r#"
        UPDATE ads.influencer_library_follow_log
        SET
          is_deleted = TRUE,
          deleted_by = $3,
          deleted_by_user_id = $4,
          deleted_at = NOW(),
          updated_by = $3,
          updated_by_user_id = $4
        WHERE id = $2
          AND influencer_library_id = $1
          AND is_deleted = FALSE
          AND updated_at::TEXT = $5::TEXT
        "#,
    )
    .bind(influencer_library_id)
    .bind(follow_log_id)
    .bind(actor.display_name.as_str())
    .bind(actor.user_id.as_str())
    .bind(expected_updated_at)
    .execute(&mut *tx)
    .await
    .map_err(|error| {
        error!(
            ?error,
            influencer_library_id,
            follow_log_id,
            "soft delete influencer library follow log failed"
        );
        AppError::Internal
    })?;

    if result.rows_affected() == 0 {
        tx.rollback().await.map_err(|error| {
            error!(
                ?error,
                influencer_library_id,
                follow_log_id,
                "rollback delete follow log transaction failed"
            );
            AppError::Internal
        })?;
        return Err(resolve_stale_follow_log_error(
            pool,
            influencer_library_id,
            follow_log_id,
            actor.user_id.as_str(),
            can_manage,
            "该跟进记录已被其他人更新，请刷新后再删除。",
        )
        .await?);
    }

    refresh_creator_follow_snapshot_in_tx(&mut tx, influencer_library_id, actor).await?;
    tx.commit().await.map_err(|error| {
        error!(
            ?error,
            influencer_library_id, follow_log_id, "commit delete follow log transaction failed"
        );
        AppError::Internal
    })?;

    Ok(())
}
