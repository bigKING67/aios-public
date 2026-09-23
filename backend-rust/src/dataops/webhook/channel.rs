use super::super::env::resolve_optional_env;
use super::super::types::DataOpsNotificationChannel;

pub(super) fn resolve_channel(channel_id: Option<&str>) -> Option<DataOpsNotificationChannel> {
    let channel_id = channel_id?.trim();
    if channel_id.is_empty() {
        return None;
    }

    super::super::DATAOPS_CONFIG
        .notification_channels
        .iter()
        .find(|item| item.id == channel_id)
        .cloned()
}

pub(crate) fn resolve_dataops_channel_webhook_url(channel_id: &str) -> Option<String> {
    let env_name = match channel_id {
        "feishu_default_bot" => "DATAOPS_FEISHU_DEFAULT_WEBHOOK_URL",
        "feishu_dataops_backup" => "DATAOPS_FEISHU_BACKUP_WEBHOOK_URL",
        _ => return None,
    };

    resolve_optional_env(env_name)
}

pub(crate) fn mask_webhook_endpoint(url: &str) -> String {
    let normalized = url.trim();
    if normalized.len() <= 18 {
        return normalized.to_string();
    }

    let prefix = normalized.chars().take(40).collect::<String>();
    let suffix = normalized
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();

    format!("{}****{}", prefix, suffix)
}
