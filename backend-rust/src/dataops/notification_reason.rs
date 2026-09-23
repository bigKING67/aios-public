use regex::Regex;
use sha2::{Digest, Sha256};

pub(super) fn build_notification_reason_hash(detail: &str) -> String {
    let normalized = normalize_notification_failure_reason(detail);
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    hex::encode(hasher.finalize())
}

pub(super) fn normalize_notification_failure_reason(detail: &str) -> String {
    let normalized = detail.trim();
    if normalized.is_empty() {
        return "未知失败原因".to_string();
    }

    let cleaned = Regex::new(r"^Webhook\s*(?:手动通知)?发送失败[:：]\s*")
        .expect("regex")
        .replace(normalized, "")
        .to_string();
    let cleaned = Regex::new(r"^Webhook\s*测试失败[:：]\s*")
        .expect("regex")
        .replace(cleaned.as_str(), "")
        .to_string();
    let cleaned = Regex::new(r"^飞书返回错误\(\d+\)[:：]\s*")
        .expect("regex")
        .replace(cleaned.as_str(), "")
        .to_string();
    let cleaned = Regex::new(r"^HTTP\s*\d+[:：]\s*")
        .expect("regex")
        .replace(cleaned.as_str(), "")
        .to_string();

    let compressed = Regex::new(r"\s+")
        .expect("regex")
        .replace_all(cleaned.trim(), " ")
        .to_string();

    if compressed.is_empty() {
        return "未知失败原因".to_string();
    }

    if compressed.chars().count() <= 220 {
        return compressed;
    }

    let prefix = compressed.chars().take(219).collect::<String>();
    format!("{}…", prefix)
}
