use std::env;

pub(super) fn normalize_database_url(raw: String) -> String {
    let mut value = raw.trim().to_string();

    if let Some(rest) = value.strip_prefix("postgresql+asyncpg://") {
        value = format!("postgresql://{rest}");
    }

    if let Some(rest) = value.strip_prefix("postgres+asyncpg://") {
        value = format!("postgres://{rest}");
    }

    if has_query_param_case_insensitive(&value, "sslmode") {
        return value;
    }

    append_url_query_param(&value, "sslmode", &resolve_db_ssl_mode())
}

fn resolve_db_ssl_mode() -> String {
    let configured = env::var("DB_SSL_MODE")
        .ok()
        .map(|value| value.trim().to_lowercase())
        .unwrap_or_default();

    if !configured.is_empty() {
        if is_supported_db_ssl_mode(&configured) {
            return configured;
        }
        eprintln!(
            "warning: invalid DB_SSL_MODE='{}', fallback to environment default",
            configured
        );
    }

    let app_env = env::var("APP_ENV")
        .ok()
        .map(|value| value.trim().to_lowercase())
        .unwrap_or_default();
    if app_env == "production" || app_env == "prod" {
        "require".to_string()
    } else {
        "prefer".to_string()
    }
}

fn is_supported_db_ssl_mode(mode: &str) -> bool {
    matches!(
        mode,
        "disable" | "allow" | "prefer" | "require" | "verify-ca" | "verify-full"
    )
}

fn has_query_param_case_insensitive(url: &str, key: &str) -> bool {
    let Some((_, query_and_fragment)) = url.split_once('?') else {
        return false;
    };

    let query = query_and_fragment.split('#').next().unwrap_or_default();
    if query.is_empty() {
        return false;
    }

    let key_lc = key.trim().to_lowercase();
    query.split('&').any(|item| {
        let current_key = item
            .split('=')
            .next()
            .unwrap_or_default()
            .trim()
            .to_lowercase();
        !current_key.is_empty() && current_key == key_lc
    })
}

fn append_url_query_param(url: &str, key: &str, value: &str) -> String {
    let joiner = if url.contains('?') { '&' } else { '?' };
    format!("{url}{joiner}{key}={value}")
}
