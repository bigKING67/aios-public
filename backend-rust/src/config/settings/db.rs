use super::super::{
    database::normalize_database_url,
    env::{env_var_or, parse_env_bool, required_env},
};

pub(super) struct DatabaseSettings {
    pub(super) database_url: String,
    pub(super) max_connections: u32,
    pub(super) min_connections: u32,
    pub(super) acquire_timeout_seconds: u64,
    pub(super) test_before_acquire: bool,
}

pub(super) fn resolve_database_settings() -> anyhow::Result<DatabaseSettings> {
    let database_url = normalize_database_url(required_env("DATABASE_URL")?);
    let max_connections = env_var_or("DB_MAX_CONNECTIONS", "30")
        .parse::<u32>()
        .unwrap_or(30);
    let min_connections = env_var_or("DB_MIN_CONNECTIONS", "0")
        .parse::<u32>()
        .unwrap_or(0)
        .min(max_connections);
    let acquire_timeout_seconds = env_var_or("DB_ACQUIRE_TIMEOUT_SECONDS", "20")
        .parse::<u64>()
        .unwrap_or(20);
    let test_before_acquire = parse_env_bool("DB_TEST_BEFORE_ACQUIRE", true);

    Ok(DatabaseSettings {
        database_url,
        max_connections,
        min_connections,
        acquire_timeout_seconds,
        test_before_acquire,
    })
}
