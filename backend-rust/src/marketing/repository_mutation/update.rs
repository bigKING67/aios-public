use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::{
    repository_access::{
        ensure_can_edit_creator, fetch_creator_record_access, is_unique_violation,
        resolve_creator_owner, OwnerResolutionMode,
    },
    repository_row_filters::item_from_row,
    repository_sql::update_creator_sql,
    types::{CreatorLibraryActor, CreatorLibraryInput, CreatorLibraryItem},
};

pub(crate) async fn update_creator_by_id(
    pool: &PgPool,
    id: i64,
    input: &CreatorLibraryInput,
    actor: &CreatorLibraryActor,
) -> AppResult<CreatorLibraryItem> {
    ensure_can_edit_creator(pool, id, actor).await?;
    if input.expected_updated_at.is_none() {
        return Err(AppError::bad_request("缺少版本字段，请刷新后再编辑。"));
    }
    let resolved_owner =
        resolve_creator_owner(pool, input, actor, true, OwnerResolutionMode::Strict).await?;
    let owner_name = resolved_owner
        .display_name
        .as_deref()
        .or(input.owner_name.as_deref());
    let owner_user_id = resolved_owner.user_id.as_deref();

    let sql = update_creator_sql();
    let row = sqlx::query(&sql)
        .bind(id)
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
        .bind(actor.display_name.as_str())
        .bind(actor.user_id.as_str())
        .bind(input.expected_updated_at.as_deref())
        .bind(actor.can_manage)
        .fetch_optional(pool)
        .await
        .map_err(|error| {
            if is_unique_violation(&error) {
                return AppError::bad_request("已存在相同平台和达人ID/昵称的达人记录");
            }
            error!(?error, id, "update influencer library item failed");
            AppError::Internal
        })?;

    if let Some(row) = row.as_ref() {
        return Ok(item_from_row(row));
    }

    match fetch_creator_record_access(pool, id).await? {
        None => Err(AppError::NotFound),
        Some(access) if !access.can_edit(actor) => Err(AppError::Forbidden),
        Some(_) => Err(AppError::Conflict(
            "该达人资料已被其他人更新，请刷新后再编辑。".to_string(),
        )),
    }
}
