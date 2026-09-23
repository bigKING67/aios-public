use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::{
    repository_access::{ensure_can_delete_creator, fetch_creator_record_access},
    types::CreatorLibraryActor,
};

pub(crate) async fn delete_creator_by_id(
    pool: &PgPool,
    id: i64,
    expected_updated_at: Option<&str>,
    actor: &CreatorLibraryActor,
) -> AppResult<()> {
    ensure_can_delete_creator(pool, id, actor).await?;
    if expected_updated_at.is_none() {
        return Err(AppError::bad_request("缺少版本字段，请刷新后再删除。"));
    }

    let result = sqlx::query(
        r#"
        UPDATE ads.influencer_library
        SET
          is_deleted = TRUE,
          updated_by = $2,
          updated_by_user_id = $3
        WHERE id = $1
          AND is_deleted = FALSE
          AND updated_at::TEXT = $4::TEXT
        "#,
    )
    .bind(id)
    .bind(actor.display_name.as_str())
    .bind(actor.user_id.as_str())
    .bind(expected_updated_at)
    .execute(pool)
    .await
    .map_err(|error| {
        error!(?error, id, "delete influencer library item failed");
        AppError::Internal
    })?;

    if result.rows_affected() == 0 {
        return match fetch_creator_record_access(pool, id).await? {
            None => Err(AppError::NotFound),
            Some(access) if !access.can_delete(actor) => Err(AppError::Forbidden),
            Some(_) => Err(AppError::Conflict(
                "该达人资料已被其他人更新，请刷新后再删除。".to_string(),
            )),
        };
    }

    Ok(())
}
