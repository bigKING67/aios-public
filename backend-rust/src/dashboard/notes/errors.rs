pub(super) fn normalize_database_error_message(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        "日报接口执行失败".to_string()
    } else {
        trimmed.to_string()
    }
}
