use std::collections::HashMap;

use chrono::Utc;

use super::super::time::to_dataops_timestamp;
use super::super::types::{DataOpsNotificationChannel, DataOpsNotificationEvent};
use super::super::webhook::{mask_webhook_endpoint, resolve_dataops_channel_webhook_url};
use super::super::DATAOPS_CONFIG;

pub(super) fn build_notification_channels(
    events: &[DataOpsNotificationEvent],
    warnings: &mut Vec<String>,
) -> Vec<DataOpsNotificationChannel> {
    let now_ts = Utc::now().timestamp_millis();
    let day_ms = 24 * 60 * 60 * 1000i64;

    let mut failure_count_map: HashMap<String, i64> = HashMap::new();
    let mut last_delivered_map: HashMap<String, String> = HashMap::new();

    for event in events.iter() {
        let sent_ts = to_dataops_timestamp(event.sent_at.as_str());
        if event.status == "failed" && sent_ts > 0 && now_ts - sent_ts <= day_ms {
            *failure_count_map
                .entry(event.channel_id.clone())
                .or_insert(0) += 1;
        }

        if event.status == "sent" && !last_delivered_map.contains_key(event.channel_id.as_str()) {
            last_delivered_map.insert(event.channel_id.clone(), event.sent_at.clone());
        }
    }

    DATAOPS_CONFIG
        .notification_channels
        .iter()
        .map(|channel| {
            let webhook = resolve_dataops_channel_webhook_url(channel.id.as_str());
            let failure_count24h = failure_count_map
                .get(channel.id.as_str())
                .copied()
                .unwrap_or(channel.failure_count24h);

            let mut next = channel.clone();
            next.failure_count24h = failure_count24h;
            next.last_delivered_at = last_delivered_map
                .get(channel.id.as_str())
                .cloned()
                .or_else(|| channel.last_delivered_at.clone());

            if !channel.enabled {
                next.status = "paused".to_string();
            } else if webhook.is_none() {
                next.status = "warning".to_string();
                warnings.push(format!(
                    "通道「{}」缺少 Webhook 环境变量，无法发送通知",
                    channel.channel_name
                ));
            } else if failure_count24h > 0 {
                next.status = "warning".to_string();
            } else {
                next.status = "healthy".to_string();
            }

            if let Some(url) = webhook {
                next.endpoint_masked = mask_webhook_endpoint(url.as_str());
            }

            next
        })
        .collect()
}
