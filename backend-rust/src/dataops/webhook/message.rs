use chrono::Utc;
use serde_json::{Map, Value};

use crate::auth::CurrentUser;

use super::super::access::resolve_operator;
use super::super::time::format_shanghai_datetime_from_utc;
use super::super::types::DataOpsNotificationChannel;

pub(super) const MAX_WEBHOOK_MESSAGE_TEXT_CHARS: usize = 6000;

pub(super) fn trimmed_param(params: &Map<String, Value>, key: &str) -> String {
    params
        .get(key)
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .unwrap_or_default()
}

pub(super) fn build_manual_webhook_text(
    channel: &DataOpsNotificationChannel,
    current_user: &CurrentUser,
    raw_message_title: String,
    raw_message_text: &str,
) -> String {
    let title = if raw_message_title.is_empty() {
        "[DataOps Hub] 手动告警通知".to_string()
    } else {
        raw_message_title
    };

    [
        title,
        format!("通道: {}", channel.channel_name),
        format!("操作人: {}", resolve_operator(current_user)),
        format!("时间: {}", format_shanghai_datetime_from_utc(Utc::now())),
        String::new(),
        raw_message_text.to_string(),
    ]
    .join("\n")
}

pub(super) fn build_test_webhook_text(
    channel: &DataOpsNotificationChannel,
    current_user: &CurrentUser,
) -> String {
    format!(
        "[DataOps Hub] Webhook 连通性测试\n通道: {}\n操作人: {}\n时间: {}",
        channel.channel_name,
        resolve_operator(current_user),
        format_shanghai_datetime_from_utc(Utc::now())
    )
}

pub(super) fn build_success_detail(
    current_user: &CurrentUser,
    is_manual_notification: bool,
    raw_message_text: &str,
) -> String {
    if is_manual_notification {
        format!(
            "由 {} 发起，消息长度 {} 字符。",
            resolve_operator(current_user),
            raw_message_text.chars().count()
        )
    } else {
        format!("由 {} 发起，通道返回正常。", resolve_operator(current_user))
    }
}
