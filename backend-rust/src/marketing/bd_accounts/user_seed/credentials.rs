use std::env;

use bcrypt::{hash, DEFAULT_COST};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::types::DEFAULT_BD_PASSWORD_ENV;

pub(in crate::marketing::bd_accounts) fn hash_initial_password() -> AppResult<String> {
    let password = env::var(DEFAULT_BD_PASSWORD_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::bad_request(format!(
                "归属BD不存在，且后端未配置 {}，无法自动创建BD账号",
                DEFAULT_BD_PASSWORD_ENV
            ))
        })?;
    hash(password.as_str(), DEFAULT_COST).map_err(|error| {
        error!(
            ?error,
            "hash auto-created creator library BD password failed"
        );
        AppError::Internal
    })
}
