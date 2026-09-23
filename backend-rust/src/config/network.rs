pub(super) fn parse_cors_origins(raw: &str) -> Vec<String> {
    let normalized = raw.trim();

    if normalized.starts_with('[') {
        if let Ok(values) = serde_json::from_str::<Vec<String>>(normalized) {
            return values
                .into_iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect();
        }
    }

    normalized
        .split(',')
        .map(|value| value.trim().trim_matches('"').to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

pub(super) fn normalize_dragonfly_url(raw: String) -> String {
    let value = raw.trim();

    if let Some(rest) = value.strip_prefix("dragonfly://") {
        return format!("redis://{rest}");
    }

    if let Some(rest) = value.strip_prefix("dragonflys://") {
        return format!("rediss://{rest}");
    }

    value.to_string()
}
