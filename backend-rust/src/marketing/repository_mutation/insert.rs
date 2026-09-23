use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::{
    repository::repository_query::fetch_creator_by_id,
    repository_access::{is_unique_violation, resolve_creator_owner, OwnerResolutionMode},
    repository_follow_logs::create_follow_log,
    repository_row_filters::item_from_row,
    repository_sql::insert_creator_sql,
    types::{CreatorLibraryActor, CreatorLibraryInput, CreatorLibraryItem},
};

pub(crate) async fn insert_creator(
    pool: &PgPool,
    input: &CreatorLibraryInput,
    actor: &CreatorLibraryActor,
    source_type: &str,
) -> AppResult<CreatorLibraryItem> {
    let owner_resolution_mode =
        if source_type == "csv_import" || source_type == "spreadsheet_import" {
            OwnerResolutionMode::AutoCreateForImport
        } else {
            OwnerResolutionMode::Strict
        };
    let resolved_owner =
        resolve_creator_owner(pool, input, actor, true, owner_resolution_mode).await?;
    let owner_name = resolved_owner
        .display_name
        .as_deref()
        .or(input.owner_name.as_deref());
    let owner_user_id = resolved_owner.user_id.as_deref();

    let sql = insert_creator_sql();
    let row = sqlx::query(&sql)
        .bind(input.platform.as_str())
        .bind(input.influencer_name.as_str())
        .bind(input.influencer_id.as_deref())
        .bind(input.douyin_handle.as_deref())
        .bind(input.phone.as_deref())
        .bind(input.mcn.as_deref())
        .bind(input.category.as_deref())
        .bind(input.anchor_desc.as_deref())
        .bind(input.anchor_level.as_deref())
        .bind(input.main_platform_fans.as_deref())
        .bind(input.sales_30d.as_deref())
        .bind(input.sales_90d.as_deref())
        .bind(&input.tags)
        .bind(input.cooperation_status.as_deref())
        .bind(input.cooperation_status_norm.as_str())
        .bind(input.cooperation_desc.as_deref())
        .bind(owner_name)
        .bind(owner_user_id)
        .bind(input.is_cooperable)
        .bind(input.last_followed_at)
        .bind(input.follow_note.as_deref())
        .bind(source_type)
        .bind(actor.display_name.as_str())
        .bind(actor.user_id.as_str())
        .bind(actor.can_manage)
        .fetch_one(pool)
        .await
        .map_err(|error| {
            if matches!(error, sqlx::Error::RowNotFound) {
                return AppError::Conflict(
                    "已存在同平台达人，请刷新列表后编辑，避免覆盖他人修改。".to_string(),
                );
            }
            if is_unique_violation(&error) {
                return AppError::bad_request("已存在相同平台和达人ID/昵称的达人记录");
            }
            error!(?error, "upsert influencer library item failed");
            AppError::Internal
        })?;

    let item = item_from_row(&row);
    if source_type == "csv_import" && input.follow_note.is_some() {
        create_follow_log(
            pool,
            item.id,
            input.follow_note.as_deref().unwrap_or_default(),
            actor,
        )
        .await?;
        return fetch_creator_by_id(pool, item.id, actor.user_id.as_str(), actor.can_manage)
            .await?
            .ok_or(AppError::NotFound);
    }

    Ok(item)
}
