use serde::Serialize;

#[derive(Debug, Serialize)]
pub(super) struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<ThinkingConfig>,
    response_format: ResponseFormat,
}

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    format_type: String,
}

#[derive(Debug, Serialize)]
struct ThinkingConfig {
    #[serde(rename = "type")]
    thinking_type: String,
}

impl ChatCompletionRequest {
    pub(super) fn new(
        model: String,
        system_prompt: String,
        user_prompt: String,
        temperature: Option<f32>,
        max_tokens: u32,
        thinking_enabled: bool,
    ) -> Self {
        Self {
            model,
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system_prompt,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: user_prompt,
                },
            ],
            temperature,
            max_tokens,
            thinking: thinking_enabled.then(|| ThinkingConfig {
                thinking_type: "enabled".to_string(),
            }),
            response_format: ResponseFormat {
                format_type: "json_object".to_string(),
            },
        }
    }
}
