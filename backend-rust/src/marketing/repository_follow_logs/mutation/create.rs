use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};
use crate::marketing::{
    repository_access::ensure_can_edit_creator,
    types::{CreatorLibraryActor, CreatorLibraryFollowLogItem},
};

use super::super::{
    access::lock_creator_for_follow_mutation, row_mapping::follow_log_from_row,
    snapshot::refresh_creator_follow_snapshot_in_tx,
};

pub(in crate::marketing) async fn create_follow_log(
    pool: &PgPool,
    influencer_library_id: i64,
    follow_note: &str,
    actor: &CreatorLibraryActor,
) -> AppResult<CreatorLibraryFollowLogItem> {
    ensure_can_edit_creator(pool, influencer_library_id, actor).await?;

    let mut tx = pool.begin().await.map_err(|error| {
        error!(
            ?error,
            influencer_library_id, "begin create follow log transaction failed"
        );
        AppError::Internal
    })?;
    lock_creator_for_follow_mutation(&mut tx, influencer_library_id).await?;

    let row = sqlx::query(
        r#"
        INSERT INTO ads.influencer_library_follow_log (
          influencer_library_id,
          followed_at,
          follow_note,
          created_by,
          updated_by,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1,
          date_trunc('minute', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai'),
          $2,
          $3,
          $3,
          $4,
          $4
        )
        RETURNING
          id,
          influencer_library_id,
          TO_CHAR(followed_at, 'YYYY-MM-DD HH24:MI') AS followed_at,
          follow_note,
          created_by,
          updated_by,
          TRUE AS can_edit,
          TRUE AS can_delete,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        "#,
    )
    .bind(influencer_library_id)
    .bind(follow_note)
    .bind(actor.display_name.as_str())
    .bind(actor.user_id.as_str())
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| {
        error!(
            ?error,
            influencer_library_id, "insert influencer library follow log failed"
        );
        AppError::Internal
    })?;

    refresh_creator_follow_snapshot_in_tx(&mut tx, influencer_library_id, actor).await?;
    tx.commit().await.map_err(|error| {
        error!(
            ?error,
            influencer_library_id, "commit create follow log transaction failed"
        );
        AppError::Internal
    })?;

    Ok(follow_log_from_row(&row))
}
