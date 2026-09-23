use super::super::env::env_var_or;

pub(super) struct ReportSettings {
    pub(super) weekly_report_cache_ttl_seconds: u64,
    pub(super) weekly_period_cache_ttl_seconds: u64,
    pub(super) monthly_report_cache_ttl_seconds: u64,
    pub(super) monthly_period_cache_ttl_seconds: u64,
    pub(super) report_build_concurrency: usize,
    pub(super) report_warmup_weekly_period_limit: i64,
    pub(super) report_warmup_monthly_period_limit: i64,
    pub(super) report_warmup_parallelism: usize,
    pub(super) report_warmup_interval_seconds: u64,
}

pub(super) fn resolve_report_settings() -> ReportSettings {
    ReportSettings {
        weekly_report_cache_ttl_seconds: env_var_or("WEEKLY_REPORT_CACHE_TTL_SECONDS", "900")
            .parse::<u64>()
            .unwrap_or(900),
        weekly_period_cache_ttl_seconds: env_var_or("WEEKLY_PERIOD_CACHE_TTL_SECONDS", "60")
            .parse::<u64>()
            .unwrap_or(60),
        monthly_report_cache_ttl_seconds: env_var_or("MONTHLY_REPORT_CACHE_TTL_SECONDS", "900")
            .parse::<u64>()
            .unwrap_or(900),
        monthly_period_cache_ttl_seconds: env_var_or("MONTHLY_PERIOD_CACHE_TTL_SECONDS", "60")
            .parse::<u64>()
            .unwrap_or(60),
        report_build_concurrency: env_var_or("REPORT_BUILD_CONCURRENCY", "8")
            .parse::<usize>()
            .unwrap_or(8)
            .clamp(1, 64),
        report_warmup_weekly_period_limit: env_var_or("REPORT_WARMUP_WEEKLY_PERIOD_LIMIT", "200")
            .parse::<i64>()
            .unwrap_or(200)
            .clamp(1, 200),
        report_warmup_monthly_period_limit: env_var_or("REPORT_WARMUP_MONTHLY_PERIOD_LIMIT", "200")
            .parse::<i64>()
            .unwrap_or(200)
            .clamp(1, 200),
        report_warmup_parallelism: env_var_or("REPORT_WARMUP_PARALLELISM", "6")
            .parse::<usize>()
            .unwrap_or(6)
            .clamp(1, 64),
        report_warmup_interval_seconds: env_var_or("REPORT_WARMUP_INTERVAL_SECONDS", "300")
            .parse::<u64>()
            .unwrap_or(300)
            .min(86400),
    }
}
