use crate::error::{AppError, AppResult};

pub(super) fn clean_text(value: Option<String>, max_len: usize) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .map(|item| {
            if item.chars().count() > max_len {
                item.chars().take(max_len).collect()
            } else {
                item
            }
        })
}

pub(super) fn clean_required_text(
    value: Option<String>,
    max_len: usize,
    message: &str,
) -> AppResult<String> {
    clean_text(value, max_len).ok_or_else(|| AppError::bad_request(message))
}

pub(super) fn clean_platform_code(value: Option<String>, max_len: usize) -> Option<String> {
    clean_text(value, max_len).map(canonicalize_content_platform)
}

pub(super) fn clean_required_platform_code(
    value: Option<String>,
    max_len: usize,
    message: &str,
) -> AppResult<String> {
    clean_platform_code(value, max_len).ok_or_else(|| AppError::bad_request(message))
}

pub(super) fn clean_required_ad_platform_code(
    value: Option<String>,
    max_len: usize,
    message: &str,
) -> AppResult<String> {
    clean_text(value, max_len)
        .map(canonicalize_ad_platform)
        .ok_or_else(|| AppError::bad_request(message))
}

fn canonicalize_content_platform(value: String) -> String {
    let normalized = normalize_platform_token(&value);
    match normalized.as_str() {
        "抖音" | "douyin" | "dy" => "douyin".to_string(),
        "淘宝" | "天猫" | "淘系" | "taobao" | "tmall" | "taoxi" => "taobao".to_string(),
        "千川" | "巨量千川" | "qianchuan" | "oceanengine_qianchuan" => {
            "qianchuan".to_string()
        }
        "小红书" | "xiaohongshu" | "redbook" | "xhs" => "xhs".to_string(),
        "快手" | "kuaishou" | "ks" => "kuaishou".to_string(),
        "视频号" | "微信视频号" | "wechat_channels" | "shipinhao" => {
            "wechat_channels".to_string()
        }
        "其他" | "unknown" | "other" => "other".to_string(),
        _ => normalized,
    }
}

fn canonicalize_ad_platform(value: String) -> String {
    let normalized = normalize_platform_token(&value);
    match normalized.as_str() {
        "巨量" | "巨量引擎" | "oceanengine" | "ocean_engine" => "ocean_engine".to_string(),
        "小红书聚光" | "聚光" | "xhsjuguang" | "xhs_juguang" => "xhs_juguang".to_string(),
        _ => canonicalize_content_platform(value),
    }
}

fn normalize_platform_token(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace([' ', '\t', '\n'], "")
        .replace(['-', '/', '／'], "_")
}
