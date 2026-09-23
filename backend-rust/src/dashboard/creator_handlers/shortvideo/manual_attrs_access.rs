use sqlx::{PgPool, Row};
use tracing::error;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
};

use super::super::super::validation::can_manage_creator_shortvideo_manual_attrs;

#[derive(Debug)]
pub(super) struct CreatorShortVideoManualAttrsTargetAccess {
    owner_user_ids: Vec<String>,
}

impl CreatorShortVideoManualAttrsTargetAccess {
    pub(super) fn can_edit(&self, current_user: &CurrentUser) -> bool {
        if can_manage_creator_shortvideo_manual_attrs(current_user) {
            return true;
        }

        let user_id = current_user.user_id.trim();
        if user_id.is_empty() {
            return false;
        }

        self.owner_user_ids.is_empty()
            || self
                .owner_user_ids
                .iter()
                .any(|owner_user_id| owner_user_id.trim() == user_id)
    }
}

pub(super) async fn fetch_manual_attrs_target_access(
    pool: &PgPool,
    author_douyin_id: &str,
    video_id: &str,
) -> AppResult<Option<CreatorShortVideoManualAttrsTargetAccess>> {
    let row = sqlx::query(
        r#"
        SELECT
          EXISTS (
            SELECT 1
            FROM ads.douyin_shortvideo_detail d
            WHERE d.detail_grain = 'trade_video_day'
              AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
              AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') NOT LIKE '%自营%'
              AND COALESCE(NULLIF(BTRIM(d.author_douyin_id), ''), '') = $1
              AND COALESCE(NULLIF(BTRIM(d.video_id), ''), '') = $2
          ) AS fact_exists,
          COALESCE(ARRAY(
            SELECT DISTINCT owner_item.owner_user_id
            FROM (
              SELECT NULLIF(BTRIM(asset.owner_user_id), '') AS owner_user_id
              FROM ads.douyin_shortvideo_detail d
              CROSS JOIN LATERAL unnest(COALESCE(d.asset_ids, '{}'::UUID[])) AS asset_item(asset_id)
              JOIN ads.marketing_content_assets asset
                ON asset.asset_id = asset_item.asset_id
               AND asset.is_deleted = FALSE
              WHERE d.detail_grain = 'trade_video_day'
                AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
                AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') NOT LIKE '%自营%'
                AND COALESCE(NULLIF(BTRIM(d.author_douyin_id), ''), '') = $1
                AND COALESCE(NULLIF(BTRIM(d.video_id), ''), '') = $2
            ) owner_item
            WHERE owner_item.owner_user_id IS NOT NULL
            ORDER BY owner_item.owner_user_id
          ), '{}'::TEXT[]) AS owner_user_ids
        "#,
    )
    .bind(author_douyin_id)
    .bind(video_id)
    .fetch_one(pool)
    .await
    .map_err(|raw_error| {
        error!(
            target: "dashboard-creator-shortvideo-manual-attrs",
            %author_douyin_id,
            %video_id,
            error = %raw_error,
            "fact identity access check failed"
        );
        AppError::Internal
    })?;

    let fact_exists = row.try_get::<bool, _>("fact_exists").unwrap_or(false);
    if !fact_exists {
        return Ok(None);
    }

    Ok(Some(CreatorShortVideoManualAttrsTargetAccess {
        owner_user_ids: row.try_get("owner_user_ids").unwrap_or_default(),
    }))
}

#[cfg(test)]
mod tests {
    use super::CreatorShortVideoManualAttrsTargetAccess;
    use crate::auth::CurrentUser;

    fn user(user_id: &str, roles: &[&str], permissions: &[&str]) -> CurrentUser {
        CurrentUser {
            user_id: user_id.to_string(),
            username: Some(user_id.to_string()),
            roles: roles.iter().map(|value| (*value).to_string()).collect(),
            permissions: permissions
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
        }
    }

    fn target(owner_user_ids: &[&str]) -> CreatorShortVideoManualAttrsTargetAccess {
        CreatorShortVideoManualAttrsTargetAccess {
            owner_user_ids: owner_user_ids
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
        }
    }

    #[test]
    fn allows_authenticated_dashboard_user_to_edit_ownerless_target() {
        assert!(target(&[]).can_edit(&user("viewer-001", &["dashboard_view"], &[])));
    }

    #[test]
    fn allows_any_matching_owner_for_owned_target() {
        let access = target(&["user-002", "user-003"]);

        assert!(access.can_edit(&user("user-003", &[], &[])));
        assert!(access.can_edit(&user("user-002", &[], &[])));
    }

    #[test]
    fn rejects_non_owner_without_manager_scope() {
        assert!(!target(&["user-002"]).can_edit(&user("user-001", &["content_ops"], &[])));
    }

    #[test]
    fn allows_manager_override_for_owned_target() {
        assert!(target(&["user-002"]).can_edit(&user("user-001", &["content_ops_manager"], &[])));
        assert!(target(&["user-002"]).can_edit(&user("user-001", &["admin"], &[])));
    }

    #[test]
    fn allows_admin_role_override_for_owned_target() {
        assert!(target(&["user-002"]).can_edit(&user("operator", &["admin"], &[])));
    }
}
