use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub(super) struct ChatCompletionResponse {
    pub(super) choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ChatChoice {
    pub(super) message: ChatMessageResponse,
}

#[derive(Debug, Deserialize)]
pub(super) struct ChatMessageResponse {
    pub(super) content: Value,
}
