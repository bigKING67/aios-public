use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::AppResult,
};

use crate::marketing::types::{
    CreatorLibraryActor, BD_MANAGER_ROLE_CODE, BD_ROLE_CODE, CREATOR_LIBRARY_MANAGE_PERMISSION,
    CREATOR_LIBRARY_READ_PERMISSIONS, CREATOR_LIBRARY_WRITE_PERMISSIONS,
};

pub(super) fn ensure_read_permission(user: &CurrentUser) -> AppResult<()> {
    if user.has_role(BD_ROLE_CODE) || user.has_role(BD_MANAGER_ROLE_CODE) {
        return Ok(());
    }
    ensure_any_permission(user, &CREATOR_LIBRARY_READ_PERMISSIONS)
}

pub(super) fn ensure_write_permission(user: &CurrentUser) -> AppResult<()> {
    if user.has_role(BD_ROLE_CODE) || user.has_role(BD_MANAGER_ROLE_CODE) {
        return Ok(());
    }
    ensure_any_permission(user, &CREATOR_LIBRARY_WRITE_PERMISSIONS)
}

pub(super) fn has_creator_library_manage_permission(user: &CurrentUser) -> bool {
    user.is_admin()
        || user.has_role(BD_MANAGER_ROLE_CODE)
        || user.has_permission(CREATOR_LIBRARY_MANAGE_PERMISSION)
}

pub(super) fn resolve_actor(user: &CurrentUser) -> CreatorLibraryActor {
    let display_name = user
        .username
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(user.user_id.as_str())
        .to_string();

    CreatorLibraryActor {
        user_id: user.user_id.clone(),
        display_name,
        is_bd: user.has_role(BD_ROLE_CODE),
        can_manage: has_creator_library_manage_permission(user),
    }
}
