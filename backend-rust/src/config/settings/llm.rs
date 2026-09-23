use super::super::env::env_var_or;

pub(super) struct LlmSettings {
    pub(super) default_provider: String,
    pub(super) default_model: String,
    pub(super) timeout_seconds: u64,
    pub(super) reasoner_timeout_seconds: u64,
    pub(super) reasoner_max_tokens: u32,
    pub(super) temperature: f32,
    pub(super) max_tokens: u32,
    pub(super) kimi_base_url: String,
    pub(super) kimi_api_key: String,
    pub(super) kimi_model: String,
    pub(super) deepseek_base_url: String,
    pub(super) deepseek_api_key: String,
    pub(super) deepseek_model: String,
}

pub(super) fn resolve_llm_settings() -> LlmSettings {
    LlmSettings {
        default_provider: env_var_or("LLM_DEFAULT_PROVIDER", "deepseek"),
        default_model: env_var_or("LLM_DEFAULT_MODEL", ""),
        timeout_seconds: env_var_or("LLM_TIMEOUT_SECONDS", "60")
            .parse::<u64>()
            .unwrap_or(60),
        // DeepSeek reasoner 在排队+思考模式下可能持续较久，默认给到 11 分钟以覆盖官方建议上限。
        reasoner_timeout_seconds: env_var_or("LLM_REASONER_TIMEOUT_SECONDS", "660")
            .parse::<u64>()
            .unwrap_or(660),
        // DeepSeek reasoner 的 max_tokens 会同时覆盖 reasoning + 最终回答，默认抬高避免 content 为空。
        reasoner_max_tokens: env_var_or("LLM_REASONER_MAX_TOKENS", "8192")
            .parse::<u32>()
            .unwrap_or(8192),
        temperature: env_var_or("LLM_TEMPERATURE", "1.0")
            .parse::<f32>()
            .unwrap_or(1.0),
        max_tokens: env_var_or("LLM_MAX_TOKENS", "2000")
            .parse::<u32>()
            .unwrap_or(2000),
        kimi_base_url: env_var_or("KIMI_BASE_URL", "https://api.moonshot.cn/v1"),
        kimi_api_key: env_var_or("KIMI_API_KEY", ""),
        kimi_model: env_var_or("KIMI_MODEL", "kimi-k2.5"),
        deepseek_base_url: env_var_or("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        deepseek_api_key: env_var_or("DEEPSEEK_API_KEY", ""),
        deepseek_model: env_var_or("DEEPSEEK_MODEL", "deepseek-reasoner"),
    }
}
