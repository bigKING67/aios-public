use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
};

use super::{
    repository::query_asset_by_id, repository_options::query_content_asset_owner_user_exists,
    types::ContentAssetItem,
};

pub(super) fn ensure_content_asset_read_permission(current_user: &CurrentUser) -> AppResult<()> {
    if current_user.user_id.trim().is_empty() {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

pub(super) fn ensure_content_asset_upload_permission(current_user: &CurrentUser) -> AppResult<()> {
    if has_content_asset_write_scope(current_user) {
        return Ok(());
    }
    Err(AppError::Forbidden)
}

pub(super) fn ensure_content_asset_manage_permission(current_user: &CurrentUser) -> AppResult<()> {
    if is_content_asset_manager(current_user) {
        return Ok(());
    }
    Err(AppError::Forbidden)
}

pub(super) async fn ensure_content_asset_owner_option(
    pool: &PgPool,
    owner_user_id: Option<&str>,
) -> AppResult<()> {
    let Some(owner_user_id) = owner_user_id else {
        return Ok(());
    };
    if query_content_asset_owner_user_exists(pool, owner_user_id).await? {
        return Ok(());
    }
    Err(AppError::bad_request("负责人必须属于内容中台权限组"))
}

pub(super) async fn ensure_content_asset_edit_permission(
    pool: &PgPool,
    current_user: &CurrentUser,
    asset_id: Uuid,
) -> AppResult<ContentAssetItem> {
    let asset = query_asset_by_id(pool, asset_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if can_edit_content_asset(current_user, &asset) {
        return Ok(asset);
    }
    Err(AppError::Forbidden)
}

pub(super) fn attach_asset_permissions(items: &mut [ContentAssetItem], current_user: &CurrentUser) {
    for item in items {
        item.can_edit = can_edit_content_asset(current_user, item);
    }
}

pub(super) fn can_edit_content_asset(current_user: &CurrentUser, asset: &ContentAssetItem) -> bool {
    can_edit_content_asset_owner_scope(
        current_user,
        asset.owner_user_id.as_deref(),
        asset.uploaded_by_user_id.as_deref(),
        asset.asset_status.as_str(),
    )
}

pub(super) fn can_edit_content_asset_owner_scope(
    current_user: &CurrentUser,
    owner_user_id: Option<&str>,
    uploaded_by_user_id: Option<&str>,
    asset_status: &str,
) -> bool {
    if is_content_asset_manager(current_user) {
        return true;
    }
    if !has_content_asset_write_scope(current_user) {
        return false;
    }

    let user_id = current_user.user_id.trim();
    if user_id.is_empty() {
        return false;
    }

    let owner_user_id = owner_user_id
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if owner_user_id.is_none() {
        return true;
    }

    if owner_user_id == Some(user_id) {
        return true;
    }

    // The uploader may finish the initial upload they started. After the asset
    // leaves the uploading state, the assigned owner becomes the only editor.
    asset_status == "uploading"
        && uploaded_by_user_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            == Some(user_id)
}

fn has_content_asset_write_scope(current_user: &CurrentUser) -> bool {
    is_content_asset_manager(current_user)
        || current_user.has_role("content_ops")
        || current_user.has_role("content-ops")
        || current_user.has_role("contentops")
        || current_user.has_permission("marketing:content_assets:write")
}

fn is_content_asset_manager(current_user: &CurrentUser) -> bool {
    current_user.is_admin()
        || current_user.has_role("content_ops_manager")
        || current_user.has_role("content-ops-manager")
        || current_user.has_role("contentopsmanager")
        || current_user.has_permission("marketing:content_assets:manage")
}

#[cfg(test)]
mod tests {
    use super::can_edit_content_asset_owner_scope;
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

    #[test]
    fn content_asset_writer_can_edit_ownerless_asset() {
        assert!(can_edit_content_asset_owner_scope(
            &user("user-001", &["content_ops"], &[]),
            None,
            None,
            "ready"
        ));
        assert!(can_edit_content_asset_owner_scope(
            &user("user-001", &["content-ops"], &[]),
            None,
            None,
            "ready"
        ));
    }

    #[test]
    fn content_asset_owned_asset_requires_owner_or_manager() {
        assert!(can_edit_content_asset_owner_scope(
            &user("owner-001", &["content_ops"], &[]),
            Some("owner-001"),
            Some("uploader-001"),
            "ready"
        ));
        assert!(!can_edit_content_asset_owner_scope(
            &user("other-001", &["content_ops"], &[]),
            Some("owner-001"),
            Some("other-001"),
            "ready"
        ));
        assert!(can_edit_content_asset_owner_scope(
            &user("manager-001", &["content_ops_manager"], &[]),
            Some("owner-001"),
            None,
            "ready"
        ));
        assert!(can_edit_content_asset_owner_scope(
            &user("manager-001", &["content-ops-manager"], &[]),
            Some("owner-001"),
            None,
            "ready"
        ));
    }

    #[test]
    fn content_asset_uploading_uploader_can_complete_initial_upload_only() {
        assert!(can_edit_content_asset_owner_scope(
            &user("uploader-001", &["content_ops"], &[]),
            Some("owner-001"),
            Some("uploader-001"),
            "uploading"
        ));
        assert!(!can_edit_content_asset_owner_scope(
            &user("uploader-001", &["content_ops"], &[]),
            Some("owner-001"),
            Some("uploader-001"),
            "ready"
        ));
    }

    #[test]
    fn default_super_admin_identity_can_edit_owned_asset() {
        assert!(can_edit_content_asset_owner_scope(
            &user("sixseven", &[], &[]),
            Some("owner-001"),
            None,
            "ready"
        ));
    }

    #[test]
    fn content_asset_read_scope_cannot_edit_ownerless_asset() {
        assert!(!can_edit_content_asset_owner_scope(
            &user("reader-001", &[], &["marketing:content_assets:read"]),
            None,
            None,
            "ready"
        ));
    }
}
