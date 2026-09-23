use chrono::Utc;

use crate::state::AppState;

use super::super::build_runtime_id;
use super::super::notification_reason::build_notification_reason_hash;
use super::super::runtime_store::append_notification_event;
use super::super::time::format_shanghai_datetime_from_utc;
use super::super::types::{DataOpsNotificationChannel, DataOpsNotificationEvent};

pub(super) struct WebhookEventInput<'a> {
    pub(super) channel: &'a DataOpsNotificationChannel,
    pub(super) is_manual_notification: bool,
    pub(super) level: &'static str,
    pub(super) status: &'static str,
    pub(super) title_prefix: &'static str,
    pub(super) detail: String,
    pub(super) include_reason_hash: bool,
    pub(super) retry_group_id: &'a str,
}

fn webhook_event_type(is_manual_notification: bool) -> &'static str {
    if is_manual_notification {
        "channel_webhook_manual"
    } else {
        "channel_webhook_test"
    }
}

fn webhook_flow_name(is_manual_notification: bool) -> &'static str {
    if is_manual_notification {
        "dataops.webhook.manual"
    } else {
        "dataops.webhook.healthcheck"
    }
}

pub(super) async fn append_webhook_event(state: &AppState, input: WebhookEventInput<'_>) {
    append_notification_event(
        state,
        DataOpsNotificationEvent {
            id: build_runtime_id("notify_runtime"),
            channel_id: input.channel.id.clone(),
            level: input.level.to_string(),
            event_type: webhook_event_type(input.is_manual_notification).to_string(),
            title: format!("{}：{}", input.title_prefix, input.channel.channel_name),
            target_table: "-".to_string(),
            flow_name: webhook_flow_name(input.is_manual_notification).to_string(),
            status: input.status.to_string(),
            sent_at: format_shanghai_datetime_from_utc(Utc::now()),
            reason_hash: if input.include_reason_hash {
                Some(build_notification_reason_hash(input.detail.as_str()))
            } else {
                None
            },
            retry_group_id: if input.retry_group_id.is_empty() {
                None
            } else {
                Some(input.retry_group_id.to_string())
            },
            detail: input.detail,
        },
    )
    .await;
}
