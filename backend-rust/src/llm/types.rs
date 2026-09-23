#[derive(Debug, Clone)]
pub struct LlmCallOptions {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking_enabled: bool,
    pub request_scope: Option<String>,
    pub system_prompt: String,
    pub user_prompt: String,
}

#[derive(Debug, Clone)]
pub struct LlmCallResult {
    pub provider: String,
    pub model: String,
    pub content: String,
}
