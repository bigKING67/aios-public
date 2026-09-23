use axum::http::HeaderMap;

use crate::error::{AppError, AppResult};

use crate::marketing::types::MAX_IMPORT_ROWS;

pub(super) fn ensure_manual_creator_influencer_id(influencer_id: &Option<String>) -> AppResult<()> {
    if influencer_id.as_deref().unwrap_or("").trim().is_empty() {
        return Err(AppError::bad_request("达人ID不能为空"));
    }
    Ok(())
}

pub(super) fn validate_positive_id(id: i64) -> AppResult<()> {
    if id <= 0 {
        return Err(AppError::bad_request("达人 ID 必须是正整数"));
    }
    Ok(())
}

pub(super) fn validate_positive_log_id(id: i64) -> AppResult<()> {
    if id <= 0 {
        return Err(AppError::bad_request("跟进记录 ID 必须是正整数"));
    }
    Ok(())
}

pub(super) fn read_expected_updated_at_header(headers: &HeaderMap) -> AppResult<Option<String>> {
    let Some(value) = headers.get("x-expected-updated-at") else {
        return Ok(None);
    };
    let value = value
        .to_str()
        .map_err(|_| AppError::bad_request("跟进记录版本字段不合法"))?
        .trim();
    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value.to_string()))
    }
}

pub(super) fn validate_import_size(row_count: usize) -> AppResult<()> {
    if row_count == 0 {
        return Err(AppError::bad_request("导入数据不能为空"));
    }
    if row_count > MAX_IMPORT_ROWS {
        return Err(AppError::bad_request(format!(
            "单次最多导入 {} 行",
            MAX_IMPORT_ROWS
        )));
    }
    Ok(())
}
