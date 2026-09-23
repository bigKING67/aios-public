mod input;
mod result_event;

use axum::{http::StatusCode, response::Response};

use crate::{auth::CurrentUser, state::AppState};

use super::super::responses::{action_error, action_success};
use super::message::{build_manual_webhook_text, build_test_webhook_text};
use super::sender::send_feishu_webhook_text;
use input::parse_webhook_action_input;
use result_event::{append_webhook_failure_event, append_webhook_success_event};

pub(crate) async fn handle_test_channel_webhook(
    state: &AppState,
    current_user: &CurrentUser,
    request: super::super::types::DataOpsActionRequest,
) -> Response {
    let input = match parse_webhook_action_input(request) {
        Ok(value) => value,
        Err(error) => return error.into_response(),
    };

    let webhook_url = match input.webhook_url.as_ref() {
        Some(value) => value,
        None => {
            let message = format!(
                "通道「{}」未配置 Webhook 环境变量",
                input.channel.channel_name
            );
            append_webhook_failure_event(
                state,
                &input.channel,
                input.is_manual_notification,
                input.retry_group_id.as_str(),
                message.as_str(),
            )
            .await;

            return action_error(
                StatusCode::BAD_REQUEST,
                "test_channel_webhook",
                message.as_str(),
                None,
                Some(input.channel.id.clone()),
                None,
            );
        }
    };

    let text = if input.is_manual_notification {
        build_manual_webhook_text(
            &input.channel,
            current_user,
            input.raw_message_title.clone(),
            input.raw_message_text.as_str(),
        )
    } else {
        build_test_webhook_text(&input.channel, current_user)
    };
    let send_result = send_feishu_webhook_text(state, webhook_url.as_str(), text.as_str()).await;

    match send_result {
        Ok(()) => {
            append_webhook_success_event(state, current_user, &input).await;

            action_success(
                StatusCode::OK,
                "test_channel_webhook",
                if input.is_manual_notification {
                    format!("Webhook 手动通知发送成功：{}", input.channel.channel_name)
                } else {
                    format!("Webhook 测试成功：{}", input.channel.channel_name)
                }
                .as_str(),
                None,
                Some(input.channel.id),
                None,
            )
        }
        Err(error_message) => {
            let detail = if input.is_manual_notification {
                format!("Webhook 手动通知发送失败：{}", error_message)
            } else {
                format!("Webhook 测试失败：{}", error_message)
            };

            append_webhook_failure_event(
                state,
                &input.channel,
                input.is_manual_notification,
                input.retry_group_id.as_str(),
                detail.as_str(),
            )
            .await;

            action_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "test_channel_webhook",
                detail.as_str(),
                None,
                Some(input.channel.id),
                None,
            )
        }
    }
}
