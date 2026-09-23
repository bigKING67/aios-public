use axum::http::StatusCode;
use serde_json::{Map, Value};

use super::super::super::{
    parse_retry_group_id,
    responses::action_error,
    types::{DataOpsActionRequest, DataOpsNotificationChannel},
};
use super::super::{
    channel::{resolve_channel, resolve_dataops_channel_webhook_url},
    message::{trimmed_param, MAX_WEBHOOK_MESSAGE_TEXT_CHARS},
};

pub(super) struct WebhookActionInput {
    pub(super) channel: DataOpsNotificationChannel,
    pub(super) retry_group_id: String,
    pub(super) raw_message_text: String,
    pub(super) raw_message_title: String,
    pub(super) is_manual_notification: bool,
    pub(super) webhook_url: Option<String>,
}

pub(super) enum WebhookInputError {
    InvalidChannel(Option<String>),
    InvalidRetryGroup { channel_id: String, message: String },
    MessageTooLong { channel_id: String },
}

impl WebhookInputError {
    pub(super) fn into_response(self) -> axum::response::Response {
        match self {
            WebhookInputError::InvalidChannel(channel_id) => action_error(
                StatusCode::BAD_REQUEST,
                "test_channel_webhook",
                "channelId 无效",
                None,
                channel_id,
                None,
            ),
            WebhookInputError::InvalidRetryGroup {
                channel_id,
                message,
            } => action_error(
                StatusCode::BAD_REQUEST,
                "test_channel_webhook",
                message.as_str(),
                None,
                Some(channel_id),
                None,
            ),
            WebhookInputError::MessageTooLong { channel_id } => action_error(
                StatusCode::BAD_REQUEST,
                "test_channel_webhook",
                "messageText 长度不能超过 6000 字符",
                None,
                Some(channel_id),
                None,
            ),
        }
    }
}

pub(super) fn parse_webhook_action_input(
    request: DataOpsActionRequest,
) -> Result<WebhookActionInput, WebhookInputError> {
    let channel = match resolve_channel(request.channel_id.as_deref()) {
        Some(item) => item,
        None => return Err(WebhookInputError::InvalidChannel(request.channel_id)),
    };

    let params = request.parameters.unwrap_or_default();
    let retry_group_id = parse_retry_group_id_from_params(&params, channel.id.as_str())?;
    let raw_message_text = trimmed_param(&params, "messageText");
    let raw_message_title = trimmed_param(&params, "messageTitle");
    let is_manual_notification = !raw_message_text.is_empty();

    if raw_message_text.chars().count() > MAX_WEBHOOK_MESSAGE_TEXT_CHARS {
        return Err(WebhookInputError::MessageTooLong {
            channel_id: channel.id.clone(),
        });
    }

    let webhook_url = resolve_dataops_channel_webhook_url(channel.id.as_str());

    Ok(WebhookActionInput {
        channel,
        retry_group_id,
        raw_message_text,
        raw_message_title,
        is_manual_notification,
        webhook_url,
    })
}

fn parse_retry_group_id_from_params(
    params: &Map<String, Value>,
    channel_id: &str,
) -> Result<String, WebhookInputError> {
    parse_retry_group_id(params.get("retryGroupId").and_then(|value| value.as_str())).map_err(
        |message| WebhookInputError::InvalidRetryGroup {
            channel_id: channel_id.to_string(),
            message,
        },
    )
}
