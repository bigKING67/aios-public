pub(super) fn normalize_platform_key(value: &str) -> String {
    let normalized = value.trim().to_lowercase();

    if normalized.is_empty() {
        return String::new();
    }

    if normalized.contains("tmall")
        || normalized.contains("taobao")
        || normalized.contains("天猫")
        || normalized.contains("淘宝")
        || normalized.contains("淘系")
    {
        return "taobao".to_string();
    }

    if normalized.contains("douyin") || normalized.contains("抖音") {
        return "douyin".to_string();
    }

    if normalized.contains("xhs")
        || normalized.contains("xiaohongshu")
        || normalized.contains("小红书")
    {
        return "xhs".to_string();
    }

    if normalized.contains("wx")
        || normalized.contains("wechat")
        || normalized.contains("weixin")
        || normalized.contains("微信")
    {
        return "wx".to_string();
    }

    if normalized.contains("jd") || normalized.contains("jingdong") || normalized.contains("京东")
    {
        return "jd".to_string();
    }

    normalized
}

pub(super) fn platform_display_name_zh(value: &str) -> String {
    match normalize_platform_key(value).as_str() {
        "taobao" => "天猫".to_string(),
        "douyin" => "抖音".to_string(),
        "xhs" => "小红书".to_string(),
        "wx" => "微信".to_string(),
        "jd" => "京东".to_string(),
        _ => value.trim().to_string(),
    }
}

pub(super) fn is_tmall_platform_name(value: &str) -> bool {
    normalize_platform_key(value) == "taobao"
}
