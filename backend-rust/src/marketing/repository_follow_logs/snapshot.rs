use sqlx::Postgres;
use tracing::error;

use crate::{
    error::{AppError, AppResult},
    marketing::types::CreatorLibraryActor,
};

pub(super) async fn refresh_creator_follow_snapshot_in_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    influencer_library_id: i64,
    actor: &CreatorLibraryActor,
) -> AppResult<()> {
    let updated_result = sqlx::query(
        r#"
        WITH latest_follow AS (
          SELECT
            followed_at::DATE AS last_followed_at,
            follow_note
          FROM ads.influencer_library_follow_log
          WHERE influencer_library_id = $1
            AND is_deleted = FALSE
          ORDER BY followed_at DESC, created_at DESC, id DESC
          LIMIT 1
        )
        UPDATE ads.influencer_library AS library
        SET
          last_followed_at = latest_follow.last_followed_at,
          follow_note = latest_follow.follow_note,
          updated_by = $2,
          updated_by_user_id = $3
        FROM latest_follow
        WHERE library.id = $1
          AND library.is_deleted = FALSE
        "#,
    )
    .bind(influencer_library_id)
    .bind(actor.display_name.as_str())
    .bind(actor.user_id.as_str())
    .execute(&mut **tx)
    .await
    .map_err(|error| {
        error!(
            ?error,
            influencer_library_id, "refresh influencer library latest follow snapshot failed"
        );
        AppError::Internal
    })?;
    if updated_result.rows_affected() > 0 {
        return Ok(());
    }

    let cleared_result = sqlx::query(
        r#"
        UPDATE ads.influencer_library AS library
        SET
          last_followed_at = NULL,
          follow_note = NULL,
          updated_by = $2,
          updated_by_user_id = $3
        WHERE library.id = $1
          AND library.is_deleted = FALSE
          AND NOT EXISTS (
            SELECT 1
            FROM ads.influencer_library_follow_log AS follow_log
            WHERE follow_log.influencer_library_id = library.id
              AND follow_log.is_deleted = FALSE
          )
        "#,
    )
    .bind(influencer_library_id)
    .bind(actor.display_name.as_str())
    .bind(actor.user_id.as_str())
    .execute(&mut **tx)
    .await
    .map_err(|error| {
        error!(
            ?error,
            influencer_library_id, "clear influencer library latest follow snapshot failed"
        );
        AppError::Internal
    })?;
    if cleared_result.rows_affected() == 0 {
        return Err(AppError::Conflict(
            "达人资料已被其他人更新，请刷新后重试。".to_string(),
        ));
    }

    Ok(())
}
