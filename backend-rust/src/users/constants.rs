pub(super) const DEFAULT_ROLE_CANDIDATES: [&str; 2] = ["viewer", "analyst"];

pub(super) const USER_LIST_PERMISSIONS: [&str; 2] = ["user:list:all", "user:list"];
pub(super) const USER_CREATE_PERMISSIONS: [&str; 2] = ["user:create:all", "user:create"];
pub(super) const USER_EDIT_PERMISSIONS: [&str; 2] = ["user:edit:all", "user:edit"];
pub(super) const USER_DELETE_PERMISSIONS: [&str; 2] = ["user:delete:all", "user:delete"];
pub(super) const USER_ASSIGN_ROLE_PERMISSIONS: [&str; 4] = [
    "user:assign_role:all",
    "user:assign_role",
    "user:edit:all",
    "user:edit",
];
