mod create;
mod delete;
mod detail;
mod list;
mod permissions;
mod update;

pub(super) use create::create_role;
pub(super) use delete::delete_role;
pub(super) use detail::get_role;
pub(super) use list::list_roles;
pub(super) use permissions::update_role_permissions;
pub(super) use update::update_role;

pub(super) const ROLE_LIST_PERMISSIONS: [&str; 4] =
    ["role:list:all", "role:list", "role:view:all", "role:view"];
pub(super) const ROLE_CREATE_PERMISSIONS: [&str; 4] = [
    "role:create:all",
    "role:create",
    "role:edit:all",
    "role:edit",
];
pub(super) const ROLE_EDIT_PERMISSIONS: [&str; 4] = [
    "role:edit:all",
    "role:edit",
    "role:update:all",
    "role:update",
];
pub(super) const ROLE_DELETE_PERMISSIONS: [&str; 4] = [
    "role:delete:all",
    "role:delete",
    "role:edit:all",
    "role:edit",
];
pub(super) const ROLE_ASSIGN_PERMISSION_PERMISSIONS: [&str; 4] = [
    "role:assign_permission:all",
    "role:assign_permission",
    "role:edit:all",
    "role:edit",
];
