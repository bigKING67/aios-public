pub(super) fn is_production() -> bool {
    resolve_optional_env("NODE_ENV")
        .map(|value| value.eq_ignore_ascii_case("production"))
        .unwrap_or(false)
}

pub(super) fn resolve_optional_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

pub(super) fn resolve_env_or(key: &str, fallback: &str) -> String {
    resolve_optional_env(key).unwrap_or_else(|| fallback.to_string())
}

pub(super) fn resolve_bool_env(key: &str, fallback: bool) -> bool {
    let Some(value) = resolve_optional_env(key) else {
        return fallback;
    };

    match value.to_lowercase().as_str() {
        "1" | "true" | "yes" | "y" | "on" => true,
        "0" | "false" | "no" | "n" | "off" => false,
        _ => fallback,
    }
}

pub(super) fn resolve_i64_env(key: &str, fallback: i64, min: i64, max: i64) -> i64 {
    let Some(value) = resolve_optional_env(key) else {
        return fallback;
    };

    let parsed = value.parse::<i64>().unwrap_or(fallback);
    parsed.clamp(min, max)
}

pub(super) fn resolve_usize_env(key: &str, fallback: usize, min: usize, max: usize) -> usize {
    let Some(value) = resolve_optional_env(key) else {
        return fallback;
    };

    value.parse::<usize>().unwrap_or(fallback).clamp(min, max)
}

pub(super) fn resolve_database_name() -> String {
    if let Some(url) = resolve_optional_env("DATABASE_URL") {
        if let Ok(parsed) = reqwest::Url::parse(url.as_str()) {
            if let Some(segment) = parsed
                .path_segments()
                .and_then(|mut segments| segments.find(|item| !item.is_empty()))
            {
                return segment.to_string();
            }
        }
    }

    resolve_env_or("PGDATABASE", "postgres")
}

pub(super) fn encode_path_segment(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push('%');
            encoded.push_str(format!("{:02X}", byte).as_str());
        }
    }
    encoded
}
