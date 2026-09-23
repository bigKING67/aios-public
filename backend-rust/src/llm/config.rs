use crate::config::Settings;

pub(super) struct ProviderConfig {
    pub(super) provider: String,
    pub(super) base_url: String,
    pub(super) api_key: String,
    pub(super) default_model: String,
}

pub(super) fn resolve_provider_config(
    settings: &Settings,
    provider: Option<String>,
) -> anyhow::Result<ProviderConfig> {
    let provider = provider
        .unwrap_or_else(|| settings.llm_default_provider.clone())
        .trim()
        .to_lowercase();

    let (base_url, api_key, default_model) = match provider.as_str() {
        "kimi" => (
            settings.kimi_base_url.clone(),
            settings.kimi_api_key.clone(),
            settings.kimi_model.clone(),
        ),
        "deepseek" => (
            settings.deepseek_base_url.clone(),
            settings.deepseek_api_key.clone(),
            settings.deepseek_model.clone(),
        ),
        _ => anyhow::bail!("unsupported provider: {provider}"),
    };

    if api_key.trim().is_empty() {
        anyhow::bail!("{provider} api key is missing");
    }

    Ok(ProviderConfig {
        provider,
        base_url,
        api_key,
        default_model,
    })
}

pub(super) fn resolve_model(
    settings: &Settings,
    model: Option<String>,
    provider_default_model: &str,
    provider: &str,
) -> anyhow::Result<String> {
    let resolved_model = model
        .unwrap_or_else(|| {
            if settings.llm_default_model.trim().is_empty() {
                provider_default_model.to_string()
            } else {
                settings.llm_default_model.clone()
            }
        })
        .trim()
        .to_string();

    if resolved_model.is_empty() {
        anyhow::bail!("{provider} model is missing");
    }

    Ok(resolved_model)
}

pub(super) fn resolve_timeout_seconds(
    settings: &Settings,
    provider: &str,
    model: &str,
    thinking_enabled: bool,
) -> u64 {
    let default_timeout = settings.llm_timeout_seconds.max(15);

    if should_omit_sampling_params(provider, model, thinking_enabled) {
        return settings
            .llm_reasoner_timeout_seconds
            .max(default_timeout)
            .max(120);
    }

    default_timeout
}

pub(super) fn resolve_max_tokens(
    settings: &Settings,
    provider: &str,
    model: &str,
    thinking_enabled: bool,
) -> u32 {
    let default_max_tokens = settings.llm_max_tokens.clamp(256, 64000);

    if should_omit_sampling_params(provider, model, thinking_enabled) {
        return settings
            .llm_reasoner_max_tokens
            .max(default_max_tokens)
            .clamp(1024, 64000);
    }

    default_max_tokens
}

pub(super) fn resolve_temperature(
    settings: &Settings,
    provider: &str,
    model: &str,
    thinking_enabled: bool,
) -> Option<f32> {
    if should_omit_sampling_params(provider, model, thinking_enabled) {
        // DeepSeek reasoning/thinking 模式不支持 sampling 参数，按官方建议不发送。
        None
    } else if provider == "kimi" && model.to_lowercase().starts_with("kimi-k2.5") {
        Some(1.0)
    } else {
        Some(settings.llm_temperature)
    }
}

pub(super) fn should_send_thinking_config(
    provider: &str,
    model: &str,
    thinking_enabled: bool,
) -> bool {
    thinking_enabled && provider == "deepseek" && !model.to_lowercase().contains("reasoner")
}

fn should_omit_sampling_params(provider: &str, model: &str, thinking_enabled: bool) -> bool {
    if provider.trim().to_lowercase() != "deepseek" {
        return false;
    }

    let normalized_model = model.trim().to_lowercase();
    normalized_model.contains("reasoner")
        || normalized_model.contains("r1")
        || normalized_model.contains("thinking")
        || thinking_enabled
}
