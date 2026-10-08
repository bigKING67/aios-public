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
        tos_bucket: env_var_or("TOS_BUCKET", "aios-content-assets"),
    }
}

/// Upper bound of assets per explicit AI 切段 request (default 5, clamped 1–20).
pub(super) fn resolve_segment_suggest_max_assets() -> usize {
    env_u64_clamped("CONTENT_AI_STUDIO_SEGMENT_SUGGEST_MAX_ASSETS", 5, 1, 20) as usize
}

/// Framework remix output duration ceiling in seconds (default 600, clamped
/// 3–600; 600 is the legacy clip engine and Run hard limit).
pub(super) fn resolve_remix_max_seconds() -> u32 {
    env_u64_clamped("CONTENT_AI_STUDIO_REMIX_MAX_SECONDS", 600, 3, 600) as u32
}

/// Runs created per framework remix batch (default 10, clamped 1–100).
pub(super) fn resolve_remix_max_per_batch() -> usize {
    env_u64_clamped("CONTENT_AI_STUDIO_REMIX_MAX_PER_BATCH", 10, 1, 100) as usize
}

/// Queued/running framework remix renders per user (default 20, clamped 1–200).
pub(super) fn resolve_remix_max_active() -> usize {
    env_u64_clamped("CONTENT_AI_STUDIO_REMIX_MAX_ACTIVE", 20, 1, 200) as usize
}

/// AI 创作中心 open access. Default on (first release is open to every signed-in
/// user); only an explicit `false`/`0`/`off`/`no` restores the owner/role rules.
pub(super) fn resolve_studio_open_access() -> bool {
    parse_studio_open_access(
        std::env::var("CONTENT_AI_STUDIO_OPEN_ACCESS")
            .ok()
            .as_deref(),
    )
}

/// Enterprise product catalog (`CONTENT_AI_STUDIO_PRODUCTS`, separated by `,`
/// `，` `、` or newlines): the products the studio offers and the library
/// accepts besides its built-in list. At most 50 names of up to 120 chars.
pub(crate) fn studio_products_from_env() -> Vec<String> {
    parse_studio_products(std::env::var("CONTENT_AI_STUDIO_PRODUCTS").ok().as_deref())
}

fn parse_studio_products(value: Option<&str>) -> Vec<String> {
    let mut products: Vec<String> = Vec::new();
    for name in value.unwrap_or_default().split([',', '，', '、', '\n']) {
        let name = name.trim();
        let valid =
            !name.is_empty() && name.chars().count() <= 120 && !name.chars().any(char::is_control);
        if valid && !products.iter().any(|existing| existing == name) && products.len() < 50 {
            products.push(name.to_string());
        }
    }
    products
}

/// AI 创作中心 enterprise tag `企业:<name>`; a blank, over-long or already
/// namespaced name disables scoping rather than guessing.
pub(super) fn resolve_studio_enterprise_tag() -> Option<String> {
    parse_studio_enterprise_tag(
        std::env::var("CONTENT_AI_STUDIO_ENTERPRISE")
            .ok()
            .as_deref(),
    )
}

fn parse_studio_enterprise_tag(value: Option<&str>) -> Option<String> {
    let name = value?.trim();
    (!name.is_empty() && name.chars().count() <= 32 && !name.contains(':'))
        .then(|| format!("企业:{name}"))
}

fn parse_studio_open_access(value: Option<&str>) -> bool {
    !value.is_some_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "false" | "0" | "off" | "no"
        )
    })
}

fn env_u64_clamped(key: &str, default_value: u64, min_value: u64, max_value: u64) -> u64 {
    env_var_or(key, default_value.to_string().as_str())
        .parse::<u64>()
        .unwrap_or(default_value)
        .clamp(min_value, max_value)
}

#[cfg(test)]
mod tests {
    use super::{parse_studio_enterprise_tag, parse_studio_open_access, parse_studio_products};

    #[test]
    fn studio_products_split_trim_and_dedupe() {
        assert_eq!(
            parse_studio_products(Some(" 【测试】百雀羚样片 ，帧颜霜、帧颜霜\n")),
            vec!["【测试】百雀羚样片", "帧颜霜"]
        );
        assert!(parse_studio_products(None).is_empty());
    }

    #[test]
    fn studio_enterprise_tag_namespaces_a_bare_name() {
        assert_eq!(
            parse_studio_enterprise_tag(Some(" 百雀羚 ")).as_deref(),
            Some("企业:百雀羚")
        );
        assert_eq!(parse_studio_enterprise_tag(None), None);
        assert_eq!(parse_studio_enterprise_tag(Some("  ")), None);
        assert_eq!(parse_studio_enterprise_tag(Some("企业:百雀羚")), None);
    }

    #[test]
    fn studio_open_access_defaults_on_and_only_explicit_false_closes_it() {
        assert!(parse_studio_open_access(None));
        assert!(parse_studio_open_access(Some("true")));
        assert!(parse_studio_open_access(Some("")));
        for value in ["false", " FALSE ", "0", "off", "No"] {
            assert!(!parse_studio_open_access(Some(value)), "{value}");
        }
    }
}
