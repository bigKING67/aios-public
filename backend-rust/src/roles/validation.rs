use crate::error::{AppError, AppResult};

use super::types::{
    CreateRoleRequest, NormalizedRoleInput, NormalizedRolePatch, UpdateRoleRequest,
};

const ROLE_CODE_MIN_LEN: usize = 2;
const ROLE_CODE_MAX_LEN: usize = 64;
const ROLE_NAME_MAX_LEN: usize = 255;

pub(super) fn normalize_create_role(payload: CreateRoleRequest) -> AppResult<NormalizedRoleInput> {
    let name = payload.name.trim().to_string();
    let code = normalize_role_code(payload.code.as_str());
    let description = payload
        .description
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    validate_role_name(&name)?;
    validate_role_code(&code)?;

    Ok(NormalizedRoleInput {
        name,
        code,
        description,
        is_active: payload.is_active.unwrap_or(true),
    })
}

pub(super) fn normalize_update_role(payload: UpdateRoleRequest) -> AppResult<NormalizedRolePatch> {
    let name = payload
        .name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(name_value) = name.as_deref() {
        validate_role_name(name_value)?;
    }

    let code = payload
        .code
        .map(|value| normalize_role_code(value.as_str()))
        .filter(|value| !value.is_empty());
    if let Some(code_value) = code.as_deref() {
        validate_role_code(code_value)?;
    }

    let description = payload.description.map(|value| value.trim().to_string());

    if name.is_none() && code.is_none() && description.is_none() && payload.is_active.is_none() {
        return Err(AppError::bad_request(
            "至少提供一个可更新字段（name/code/description/is_active）",
        ));
    }

    Ok(NormalizedRolePatch {
        name,
        code,
        description,
        is_active: payload.is_active,
    })
}

pub(super) fn normalize_permission_ids(values: &[serde_json::Value]) -> AppResult<Vec<i64>> {
    let mut ids = Vec::new();
    for value in values {
        let id = match value {
            serde_json::Value::Number(number) => number.as_i64(),
            serde_json::Value::String(text) => text.trim().parse::<i64>().ok(),
            _ => None,
        };

        let Some(id) = id else {
            return Err(AppError::bad_request(
                "permission_ids 仅支持数字或数字字符串",
            ));
        };

        if id <= 0 {
            return Err(AppError::bad_request("permission_ids 需为正整数"));
        }

        if !ids.contains(&id) {
            ids.push(id);
        }
    }

    Ok(ids)
}

fn normalize_role_code(raw: &str) -> String {
    raw.trim().to_lowercase().replace(char::is_whitespace, "_")
}

fn validate_role_name(name: &str) -> AppResult<()> {
    if name.is_empty() {
        return Err(AppError::bad_request("角色名称不能为空"));
    }

    if name.chars().count() > ROLE_NAME_MAX_LEN {
        return Err(AppError::bad_request(format!(
            "角色名称长度不能超过 {ROLE_NAME_MAX_LEN} 个字符"
        )));
    }

    Ok(())
}

fn validate_role_code(code: &str) -> AppResult<()> {
    let length = code.chars().count();
    if !(ROLE_CODE_MIN_LEN..=ROLE_CODE_MAX_LEN).contains(&length) {
        return Err(AppError::bad_request(format!(
            "角色编码长度必须在 {ROLE_CODE_MIN_LEN}-{ROLE_CODE_MAX_LEN} 个字符之间"
        )));
    }

    if !code.chars().all(|ch| ch.is_ascii_lowercase() || ch == '_') {
        return Err(AppError::bad_request("角色编码仅支持小写字母和下划线"));
    }

    Ok(())
}
