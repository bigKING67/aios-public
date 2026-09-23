use super::super::env::{env_var_or, required_env};

pub(super) struct AuthSettings {
    pub(super) secret_key: String,
    pub(super) access_token_expire_minutes: i64,
    pub(super) refresh_token_expire_days: i64,
}

pub(super) fn resolve_auth_settings() -> anyhow::Result<AuthSettings> {
    Ok(AuthSettings {
        secret_key: required_env("SECRET_KEY")?,
        access_token_expire_minutes: env_var_or("ACCESS_TOKEN_EXPIRE_MINUTES", "15")
            .parse::<i64>()
            .unwrap_or(15),
        refresh_token_expire_days: env_var_or("REFRESH_TOKEN_EXPIRE_DAYS", "7")
            .parse::<i64>()
            .unwrap_or(7),
    })
}
