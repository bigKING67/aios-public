mod credentials;
mod roles;
mod upsert;
mod username;

#[derive(Debug)]
pub(super) struct AuthUserSeed {
    pub(super) user_id: String,
}

pub(super) use credentials::hash_initial_password;
pub(super) use roles::ensure_user_role;
pub(super) use upsert::upsert_auth_user;
pub(super) use username::username_for_alias;
