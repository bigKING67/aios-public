use crate::error::{AppError, AppResult};

use super::types::{
    CreateUserRequest, NormalizedCreateUserInput, NormalizedUpdateUserInput, UpdateUserRequest,
};

const USERNAME_MIN_LEN: usize = 3;
const USERNAME_MAX_LEN: usize = 64;
const EMAIL_MAX_LEN: usize = 255;
const PASSWORD_MAX_LEN: usize = 128;

pub(super) fn normalize_create_input(
    payload: CreateUserRequest,
) -> AppResult<NormalizedCreateUserInput> {
    let username = payload.username.trim().to_string();
    let email = payload.email.trim().to_string();
    let password = payload.password;
    let full_name = payload
        .full_name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    validate_username(&username)?;
    validate_email(&email)?;
    validate_password(&password)?;

    Ok(NormalizedCreateUserInput {
        username,
        email,
        password,
        full_name,
        is_active: payload.is_active.unwrap_or(true),
    })
}

pub(super) fn normalize_update_input(
    payload: UpdateUserRequest,
) -> AppResult<NormalizedUpdateUserInput> {
    let email = payload
        .email
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(email_value) = email.as_deref() {
        validate_email(email_value)?;
    }

    let full_name = payload.full_name.map(|value| value.trim().to_string());

    if email.is_none() && full_name.is_none() && payload.is_active.is_none() {
        return Err(AppError::bad_request(
            "至少提供一个可更新字段（email/full_name/is_active）",
        ));
    }

    Ok(NormalizedUpdateUserInput {
        email,
        full_name,
        is_active: payload.is_active,
    })
}

pub(super) fn normalize_role_ids(role_ids: Vec<String>) -> AppResult<Vec<String>> {
    let mut normalized = Vec::new();
    for role_id in role_ids {
        let trimmed = role_id.trim();
        if trimmed.is_empty() {
            return Err(AppError::bad_request("role_ids 不能包含空值"));
        }

        if !normalized.iter().any(|item| item == trimmed) {
            normalized.push(trimmed.to_string());
        }
    }

    Ok(normalized)
}

fn validate_username(username: &str) -> AppResult<()> {
    let length = username.chars().count();
    if !(USERNAME_MIN_LEN..=USERNAME_MAX_LEN).contains(&length) {
        return Err(AppError::bad_request(format!(
            "用户名长度必须在 {USERNAME_MIN_LEN}-{USERNAME_MAX_LEN} 个字符之间"
        )));
    }

    let valid = username
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.');

    if !valid {
        return Err(AppError::bad_request(
            "用户名仅支持字母、数字、下划线、短横线和点号",
        ));
    }

    Ok(())
}

fn validate_email(email: &str) -> AppResult<()> {
    if email.len() > EMAIL_MAX_LEN {
        return Err(AppError::bad_request(format!(
            "邮箱长度不能超过 {EMAIL_MAX_LEN} 个字符"
        )));
    }

    let (local, domain) = email
        .split_once('@')
        .ok_or_else(|| AppError::bad_request("邮箱格式不正确"))?;

    if local.trim().is_empty() || domain.trim().is_empty() {
        return Err(AppError::bad_request("邮箱格式不正确"));
    }

    if !domain.contains('.') || domain.starts_with('.') || domain.ends_with('.') {
        return Err(AppError::bad_request("邮箱格式不正确"));
    }

    Ok(())
}

fn validate_password(password: &str) -> AppResult<()> {
    let length = password.chars().count();
    if length < 8 {
        return Err(AppError::bad_request("密码长度至少为 8 位"));
    }

    if length > PASSWORD_MAX_LEN {
        return Err(AppError::bad_request(format!(
            "密码长度不能超过 {PASSWORD_MAX_LEN} 位"
        )));
    }

    let has_letter = password.chars().any(|c| c.is_ascii_alphabetic());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());

    if !has_letter || !has_digit {
        return Err(AppError::bad_request("密码至少包含 1 个字母和 1 个数字"));
    }

    Ok(())
}
