use std::env;

pub(super) fn normalize_database_url(raw: String) -> String {
    let mut value = raw.trim().to_string();

    if let Some(rest) = value.strip_prefix("postgresql+asyncpg://") {
        value = format!("postgresql://{rest}");
    }

    if let Some(rest) = value.strip_prefix("postgres+asyncpg://") {
        value = format!("postgres://{rest}");
    }

    if value
        .split_once('?')
        .map(|(_, query)| query.to_lowercase().contains("sslmode="))
        .unwrap_or(false)
    {
        return value;
    }

    let ssl_mode = env::var("DB_SSL_MODE")
        .ok()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "prefer".to_string());
    if value.contains('?') {
        format!("{value}&sslmode={ssl_mode}")
    } else {
        format!("{value}?sslmode={ssl_mode}")
    }
}
