const SUPPORTED_PLATFORMS: [&str; 6] = ["overview", "taobao", "douyin", "xhs", "jd", "wx"];

pub(in crate::dashboard) const GOODS_SUPPORTED_PLATFORMS: [&str; 1] = ["taobao"];
pub(in crate::dashboard) const TRAFFIC_SUPPORTED_PLATFORMS: [&str; 1] = ["taobao"];
pub(in crate::dashboard) const GOODS_CARD_SUPPORTED_PLATFORMS: [&str; 1] = ["douyin"];

pub(in crate::dashboard) fn normalize_platform(raw: Option<&str>) -> String {
    raw.map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("overview")
        .to_string()
}

pub(in crate::dashboard) fn parse_include_platform_share(raw: Option<&str>) -> bool {
    let normalized = raw.unwrap_or("1").trim().to_lowercase();
    normalized != "0" && normalized != "false"
}

pub(in crate::dashboard) fn is_supported_platform(platform: &str) -> bool {
    SUPPORTED_PLATFORMS.contains(&platform)
}
