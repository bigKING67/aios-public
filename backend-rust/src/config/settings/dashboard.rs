use super::super::env::env_var_or;

pub(super) struct DashboardSettings {
    pub(super) api_cache_ttl_ms: u64,
}

pub(super) fn resolve_dashboard_settings() -> DashboardSettings {
    let api_cache_ttl_ms = env_var_or("DASHBOARD_API_CACHE_TTL_MS", "30000")
        .parse::<u64>()
        .unwrap_or(30_000)
        .min(300_000);

    DashboardSettings { api_cache_ttl_ms }
}
