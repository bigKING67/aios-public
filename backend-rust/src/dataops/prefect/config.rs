use super::super::env::{resolve_env_or, resolve_i64_env};

pub(crate) const DEFAULT_PREFECT_API_URL: &str = "http://127.0.0.1:4200/api";
pub(crate) const DEFAULT_PREFECT_TIMEOUT_MS: u64 = 12_000;
pub(crate) const DEFAULT_PREFECT_CACHE_TTL_MS: i64 = 15_000;
pub(crate) const MAX_PREFECT_CACHE_TTL_MS: i64 = 300_000;
pub(crate) const BLOCKING_FLOW_RUN_STATES: &[&str] = &["RUNNING", "PENDING", "LATE"];

pub(crate) fn get_prefect_api_url() -> String {
    resolve_env_or("DATAOPS_PREFECT_API_URL", DEFAULT_PREFECT_API_URL)
        .trim_end_matches('/')
        .to_string()
}

pub(crate) fn get_prefect_cache_ttl_ms() -> i64 {
    resolve_i64_env(
        "DATAOPS_RUNTIME_PREFECT_CACHE_TTL_MS",
        DEFAULT_PREFECT_CACHE_TTL_MS,
        0,
        MAX_PREFECT_CACHE_TTL_MS,
    )
}
