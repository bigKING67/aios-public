mod grants;
mod lookup;
mod password;
mod refresh_tokens;

pub(crate) use grants::{fetch_user_permissions, fetch_user_roles};
pub(crate) use lookup::{fetch_user_by_id, fetch_user_by_username, fetch_user_profile};
pub(crate) use password::{update_last_login_at, update_password_hash, validate_new_password};
pub(crate) use refresh_tokens::{
    persist_refresh_token, revoke_refresh_token, validate_refresh_token_storage,
};

pub(super) fn is_undefined_table(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => {
            db_error.code().map(|code| code == "42P01").unwrap_or(false)
        }
        _ => false,
    }
}

pub(super) fn is_undefined_column(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => {
            db_error.code().map(|code| code == "42703").unwrap_or(false)
        }
        _ => false,
    }
}
