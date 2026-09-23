use once_cell::sync::Lazy;
use regex::Regex;

const RETRY_GROUP_ID_PATTERN: &str = r"^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$";

static RETRY_GROUP_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(RETRY_GROUP_ID_PATTERN).expect("retry group regex"));

pub(in crate::dataops) fn parse_retry_group_id(value: Option<&str>) -> Result<String, String> {
    let Some(value) = value else {
        return Err("缺少 retryGroupId 参数".to_string());
    };

    let normalized = value.trim();
    if normalized.is_empty() {
        return Err("retryGroupId 不能为空".to_string());
    }

    if !RETRY_GROUP_REGEX.is_match(normalized) {
        return Err(
            "retryGroupId 格式非法，仅允许字母/数字/点/下划线/冒号/连字符，长度 1~80，且必须以字母或数字开头".to_string(),
        );
    }

    Ok(normalized.to_string())
}
