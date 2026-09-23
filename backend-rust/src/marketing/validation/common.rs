use chrono::NaiveDate;

use crate::error::{AppError, AppResult};

pub(super) fn normalize_required_text(
    value: Option<String>,
    max_len: usize,
    label: &str,
) -> AppResult<String> {
    let Some(value) = value.and_then(normalize_text) else {
        return Err(AppError::bad_request(format!("{}不能为空", label)));
    };
    if value.chars().count() > max_len {
        return Err(AppError::bad_request(format!(
            "{}不能超过 {} 个字符",
            label, max_len
        )));
    }
    Ok(value)
}

pub(super) fn normalize_optional_text(
    value: Option<String>,
    max_len: usize,
    label: &str,
) -> AppResult<Option<String>> {
    let Some(value) = value.and_then(normalize_text) else {
        return Ok(None);
    };
    if value.chars().count() > max_len {
        return Err(AppError::bad_request(format!(
            "{}不能超过 {} 个字符",
            label, max_len
        )));
    }
    Ok(Some(value))
}

pub(super) fn normalize_text(value: String) -> Option<String> {
    let normalized = value.trim().replace('\u{feff}', "");
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

pub(super) fn normalize_optional_date(
    value: Option<String>,
    label: &str,
) -> AppResult<Option<NaiveDate>> {
    let Some(value) = value.and_then(normalize_text) else {
        return Ok(None);
    };
    NaiveDate::parse_from_str(value.as_str(), "%Y-%m-%d")
        .map(Some)
        .map_err(|_| AppError::bad_request(format!("{}必须为 YYYY-MM-DD", label)))
}

pub(super) fn normalize_optional_bool(
    value: Option<String>,
    label: &str,
) -> AppResult<Option<bool>> {
    let Some(value) = value.and_then(normalize_text) else {
        return Ok(None);
    };
    match value.to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" | "y" | "是" | "可合作" => Ok(Some(true)),
        "false" | "0" | "no" | "n" | "否" | "不可合作" => Ok(Some(false)),
        _ => Err(AppError::bad_request(format!("{}参数不合法", label))),
    }
}

pub(super) fn normalize_optional_flag(
    value: Option<String>,
    default_value: bool,
    label: &str,
) -> AppResult<bool> {
    match normalize_optional_bool(value, label)? {
        Some(value) => Ok(value),
        None => Ok(default_value),
    }
}
