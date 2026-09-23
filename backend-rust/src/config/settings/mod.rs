mod auth;
mod content_assets;
mod dashboard;
mod db;
mod env_file;
mod llm;
mod reports;
mod sample_inventory;
mod server;

pub use sample_inventory::SampleInventoryAccessMode;

#[derive(Debug, Clone)]
pub struct Settings {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub db_max_connections: u32,
    pub db_min_connections: u32,
    pub db_acquire_timeout_seconds: u64,
    pub db_test_before_acquire: bool,
    pub dashboard_api_cache_ttl_ms: u64,
    pub secret_key: String,
    pub access_token_expire_minutes: i64,
    pub refresh_token_expire_days: i64,
    pub dragonfly_url: String,
    pub cors_origins: Vec<String>,
    pub sample_inventory_access_mode: SampleInventoryAccessMode,
    pub weekly_report_cache_ttl_seconds: u64,
    pub weekly_period_cache_ttl_seconds: u64,
    pub monthly_report_cache_ttl_seconds: u64,
    pub monthly_period_cache_ttl_seconds: u64,
    pub report_build_concurrency: usize,
    pub report_warmup_weekly_period_limit: i64,
    pub report_warmup_monthly_period_limit: i64,
    pub report_warmup_parallelism: usize,
    pub report_warmup_interval_seconds: u64,
    pub llm_default_provider: String,
    pub llm_default_model: String,
    pub llm_timeout_seconds: u64,
    pub llm_reasoner_timeout_seconds: u64,
    pub llm_reasoner_max_tokens: u32,
    pub llm_temperature: f32,
    pub llm_max_tokens: u32,
    pub kimi_base_url: String,
    pub kimi_api_key: String,
    pub kimi_model: String,
    pub deepseek_base_url: String,
    pub deepseek_api_key: String,
    pub deepseek_model: String,
    pub content_asset_delivery_provider: String,
    pub content_production_enabled: bool,
    pub content_production_planning_enabled: bool,
    pub content_production_shot_extraction_enabled: bool,
    pub content_production_semantics_enabled: bool,
    pub content_asset_cdn_base_url: String,
    pub content_asset_signed_url_ttl_seconds: u64,
    pub douyin_live_recording_upload_signed_url_ttl_seconds: u64,
    pub tos_access_key_id: String,
    pub tos_secret_access_key: String,
    pub tos_endpoint: String,
    pub tos_region: String,
    pub tos_bucket: String,
}

impl Settings {
    pub fn from_env() -> anyhow::Result<Self> {
        env_file::load_env_file_if_present("../.env.local");
        env_file::load_env_file_if_present("../.env.content-assets.local");
        env_file::load_env_file_if_present(".env.local");
        env_file::load_env_file_if_present(".env.content-assets.local");
        env_file::load_env_file_if_present(".env");

        let server = server::resolve_server_settings();
        let db = db::resolve_database_settings()?;
        let dashboard = dashboard::resolve_dashboard_settings();
        let auth = auth::resolve_auth_settings()?;
        let reports = reports::resolve_report_settings();
        let sample_inventory_access_mode =
            sample_inventory::resolve_sample_inventory_access_mode()?;
        let llm = llm::resolve_llm_settings();
        let content_assets = content_assets::resolve_content_asset_settings();

        Ok(Self {
            host: server.host,
            port: server.port,
            database_url: db.database_url,
            db_max_connections: db.max_connections,
            db_min_connections: db.min_connections,
            db_acquire_timeout_seconds: db.acquire_timeout_seconds,
            db_test_before_acquire: db.test_before_acquire,
            dashboard_api_cache_ttl_ms: dashboard.api_cache_ttl_ms,
            secret_key: auth.secret_key,
            access_token_expire_minutes: auth.access_token_expire_minutes,
            refresh_token_expire_days: auth.refresh_token_expire_days,
            dragonfly_url: server.dragonfly_url,
            cors_origins: server.cors_origins,
            sample_inventory_access_mode,
            weekly_report_cache_ttl_seconds: reports.weekly_report_cache_ttl_seconds,
            weekly_period_cache_ttl_seconds: reports.weekly_period_cache_ttl_seconds,
            monthly_report_cache_ttl_seconds: reports.monthly_report_cache_ttl_seconds,
            monthly_period_cache_ttl_seconds: reports.monthly_period_cache_ttl_seconds,
            report_build_concurrency: reports.report_build_concurrency,
            report_warmup_weekly_period_limit: reports.report_warmup_weekly_period_limit,
            report_warmup_monthly_period_limit: reports.report_warmup_monthly_period_limit,
            report_warmup_parallelism: reports.report_warmup_parallelism,
            report_warmup_interval_seconds: reports.report_warmup_interval_seconds,
            llm_default_provider: llm.default_provider,
            llm_default_model: llm.default_model,
            llm_timeout_seconds: llm.timeout_seconds,
            llm_reasoner_timeout_seconds: llm.reasoner_timeout_seconds,
            llm_reasoner_max_tokens: llm.reasoner_max_tokens,
            llm_temperature: llm.temperature,
            llm_max_tokens: llm.max_tokens,
            kimi_base_url: llm.kimi_base_url,
            kimi_api_key: llm.kimi_api_key,
            kimi_model: llm.kimi_model,
            deepseek_base_url: llm.deepseek_base_url,
            deepseek_api_key: llm.deepseek_api_key,
            deepseek_model: llm.deepseek_model,
            content_asset_delivery_provider: content_assets.delivery_provider,
            content_asset_cdn_base_url: content_assets.cdn_base_url,
            content_asset_signed_url_ttl_seconds: content_assets.signed_url_ttl_seconds,
            content_production_semantics_enabled: std::env::var(
                "CONTENT_PRODUCTION_SEMANTICS_ENABLED",
            )
            .as_deref()
                == Ok("true"),
            content_production_shot_extraction_enabled: std::env::var(
                "CONTENT_PRODUCTION_SHOT_EXTRACTION_ENABLED",
            )
            .as_deref()
                == Ok("true"),
            content_production_planning_enabled: std::env::var(
                "CONTENT_PRODUCTION_PLANNING_ENABLED",
            )
            .as_deref()
                == Ok("true"),
            content_production_enabled: std::env::var("CONTENT_PRODUCTION_ENABLED").as_deref()
                == Ok("true"),
            douyin_live_recording_upload_signed_url_ttl_seconds: content_assets
                .live_recording_upload_signed_url_ttl_seconds,
            tos_access_key_id: content_assets.tos_access_key_id,
            tos_secret_access_key: content_assets.tos_secret_access_key,
            tos_endpoint: content_assets.tos_endpoint,
            tos_region: content_assets.tos_region,
            tos_bucket: content_assets.tos_bucket,
        })
    }

    pub fn runtime_read_only_from_env() -> bool {
        server::resolve_runtime_read_only()
    }
}
