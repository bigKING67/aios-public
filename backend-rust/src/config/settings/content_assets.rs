use super::super::env::env_var_or;

pub(super) struct ContentAssetSettings {
    pub(super) delivery_provider: String,
    pub(super) cdn_base_url: String,
    pub(super) signed_url_ttl_seconds: u64,
    pub(super) live_recording_upload_signed_url_ttl_seconds: u64,
    pub(super) tos_access_key_id: String,
    pub(super) tos_secret_access_key: String,
    pub(super) tos_endpoint: String,
    pub(super) tos_region: String,
    pub(super) tos_bucket: String,
}

const DEFAULT_CONTENT_ASSET_SIGNED_URL_TTL_SECONDS: u64 = 600;
const DEFAULT_LIVE_RECORDING_UPLOAD_SIGNED_URL_TTL_SECONDS: u64 = 8 * 60 * 60;

pub(super) fn resolve_content_asset_settings() -> ContentAssetSettings {
    ContentAssetSettings {
        delivery_provider: env_var_or("CONTENT_ASSET_DELIVERY_PROVIDER", "tos_signed_url")
            .to_lowercase(),
        cdn_base_url: env_var_or("CONTENT_ASSET_CDN_BASE_URL", ""),
        signed_url_ttl_seconds: env_u64_clamped(
            "CONTENT_ASSET_SIGNED_URL_TTL_SECONDS",
            DEFAULT_CONTENT_ASSET_SIGNED_URL_TTL_SECONDS,
            60,
            3600,
        ),
        live_recording_upload_signed_url_ttl_seconds: env_u64_clamped(
            "DOUYIN_LIVE_RECORDING_UPLOAD_SIGNED_URL_TTL_SECONDS",
            DEFAULT_LIVE_RECORDING_UPLOAD_SIGNED_URL_TTL_SECONDS,
            3600,
            12 * 60 * 60,
        ),
        tos_access_key_id: env_var_or("TOS_ACCESS_KEY_ID", ""),
        tos_secret_access_key: env_var_or("TOS_SECRET_ACCESS_KEY", ""),
        tos_endpoint: env_var_or("TOS_ENDPOINT", "https://tos-s3-cn-shanghai.volces.com"),
        tos_region: env_var_or("TOS_REGION", "cn-shanghai"),
        tos_bucket: env_var_or("TOS_BUCKET", "content-video-prod"),
    }
}

fn env_u64_clamped(key: &str, default_value: u64, min_value: u64, max_value: u64) -> u64 {
    env_var_or(key, default_value.to_string().as_str())
        .parse::<u64>()
        .unwrap_or(default_value)
        .clamp(min_value, max_value)
}
