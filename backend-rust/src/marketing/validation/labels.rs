use crate::error::AppResult;

use super::common::normalize_text;

pub(super) fn is_not_cooperable_status(value: &str) -> bool {
    let normalized = value
        .trim()
        .replace(char::is_whitespace, "")
        .to_ascii_uppercase();
    matches!(normalized.as_str(), "不可合作" | "禁止合作")
        || normalized == "X不合作"
        || normalized == "×不合作"
        || normalized == "✕不合作"
        || normalized == "❌不合作"
        || normalized == "不合作"
}

pub(super) fn normalize_cooperation_status_label(value: String) -> Option<String> {
    let trimmed = value.trim().replace('\u{feff}', "");
    if trimmed.is_empty() {
        return None;
    }
    let compact = trimmed.replace(char::is_whitespace, "");
    let uppercase = compact.to_ascii_uppercase();
    let normalized =
        match uppercase.as_str() {
            "" | "-" | "—" | "未分类" | "未确定" | "待分类" | "待确认" | "未知" | "UNKNOWN"
            | "UNCLASSIFIED" => "未分类",
            "黑名单" | "拉黑" | "BLACKLIST" => "黑名单",
            "初期建联" | "初联" | "建联" | "初步建联" | "刚建联" | "沟通中" | "已联系"
            | "联系中" => "初期建联",
            "试样洽谈" | "寄样洽谈" | "样品洽谈" | "寄样" | "试样" | "样品" | "报价中"
            | "洽谈中" | "推进中" => "试样洽谈",
            "暂不考虑合作" | "不考虑合作" | "暂不考虑" | "不考虑" | "无意向" | "拒绝合作"
            | "拒绝" => "暂不考虑合作",
            "合作暂停" | "暂停合作" | "暂停" | "搁置" => "合作暂停",
            "已合作开播" | "已合作挂车" | "已合作" | "合作中" | "已开播" | "开播" | "已挂车"
            | "挂车" => "已合作",
            _ => return Some(trimmed),
        };
    Some(normalized.to_string())
}

pub(super) fn normalize_anchor_level(value: Option<String>) -> AppResult<Option<String>> {
    let Some(value) = value.and_then(normalize_text) else {
        return Ok(None);
    };
    let normalized = normalize_anchor_level_label(value.as_str())
        .unwrap_or_else(|| value.replace('（', "(").replace('）', ")"));
    Ok(Some(normalized))
}

pub(crate) fn normalize_anchor_level_label(value: &str) -> Option<String> {
    let compact = value
        .trim()
        .replace('（', "(")
        .replace('）', ")")
        .replace(' ', "")
        .to_ascii_uppercase();

    if compact.contains("超头") {
        return Some("S-超头部".to_string());
    }
    if compact.contains("中腰") || compact.contains("腰部") {
        return Some("C-中腰部".to_string());
    }
    if compact.contains("肩部") {
        return Some("B-肩部".to_string());
    }
    if compact.contains("尾部") {
        return Some("D-尾部".to_string());
    }
    if compact.contains("头部") {
        return Some("A-头部".to_string());
    }

    if compact == "S" || compact.starts_with("S-") {
        return Some("S-超头部".to_string());
    }
    if compact == "A" || compact.starts_with("A-") {
        return Some("A-头部".to_string());
    }
    if compact == "B" || compact.starts_with("B-") {
        return Some("B-肩部".to_string());
    }
    if compact == "C" || compact.starts_with("C-") {
        return Some("C-中腰部".to_string());
    }
    if compact == "D" || compact.starts_with("D-") {
        return Some("D-尾部".to_string());
    }

    None
}
