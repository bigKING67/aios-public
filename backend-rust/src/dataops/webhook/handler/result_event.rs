use crate::{auth::CurrentUser, state::AppState};

use super::super::super::types::DataOpsNotificationChannel;
use super::super::{
    event::{append_webhook_event, WebhookEventInput},
    message::build_success_detail,
};
use super::input::WebhookActionInput;

pub(super) async fn append_webhook_success_event(
    state: &AppState,
    current_user: &CurrentUser,
    input: &WebhookActionInput,
) {
    append_webhook_event(
        state,
        WebhookEventInput {
            channel: &input.channel,
            is_manual_notification: input.is_manual_notification,
            level: "info",
            status: "sent",
            title_prefix: if input.is_manual_notification {
                "Webhook 手动通知成功"
            } else {
                "Webhook 测试成功"
            },
            detail: build_success_detail(
                current_user,
                input.is_manual_notification,
                input.raw_message_text.as_str(),
            ),
            include_reason_hash: false,
            retry_group_id: input.retry_group_id.as_str(),
        },
    )
    .await;
}

pub(super) async fn append_webhook_failure_event(
    state: &AppState,
    channel: &DataOpsNotificationChannel,
    is_manual_notification: bool,
    retry_group_id: &str,
    detail: &str,
) {
    append_webhook_event(
        state,
        WebhookEventInput {
            channel,
            is_manual_notification,
            level: "error",
            status: "failed",
            title_prefix: if is_manual_notification {
                "Webhook 手动通知失败"
            } else {
                "Webhook 测试失败"
            },
            detail: detail.to_string(),
            include_reason_hash: true,
            retry_group_id,
        },
    )
    .await;
}
