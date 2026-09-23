pub(in crate::dashboard) const NOTE_TEXT_MAX_LENGTH: usize = 67;
pub(in crate::dashboard) const NOTE_METRIC_KEY_MAX_LENGTH: usize = 32;

const NOTE_PLATFORMS: [&str; 5] = ["taobao", "douyin", "xhs", "jd", "wx"];
const QUERY_NOTE_PLATFORMS: [&str; 6] = ["overview", "taobao", "douyin", "xhs", "jd", "wx"];

pub(in crate::dashboard) fn is_note_platform(value: &str) -> bool {
    NOTE_PLATFORMS.contains(&value)
}

pub(in crate::dashboard) fn is_query_note_platform(value: &str) -> bool {
    QUERY_NOTE_PLATFORMS.contains(&value)
}

pub(in crate::dashboard) fn parse_note_id(raw: &str) -> Option<i64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || !trimmed.chars().all(|char| char.is_ascii_digit()) {
        return None;
    }

    let parsed = trimmed.parse::<i64>().ok()?;
    if parsed <= 0 {
        return None;
    }
    Some(parsed)
}

pub(in crate::dashboard) fn validate_note_text(
    name: &str,
    value: &str,
    max_length: usize,
) -> Option<String> {
    if value.is_empty() {
        return Some(format!("{name}不能为空"));
    }
    if value.chars().count() > max_length {
        return Some(format!("{name}不能超过 {max_length} 个字符"));
    }
    None
}
