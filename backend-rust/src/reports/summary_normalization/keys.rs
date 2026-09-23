pub(crate) fn is_two_decimal_rate_key(key: &str) -> bool {
    let normalized = key.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }

    if ["ctr", "cvr", "pay_cvr"].contains(&normalized.as_str()) {
        return true;
    }

    if normalized.ends_with("_ctr") || normalized.ends_with("_cvr") {
        return true;
    }

    [
        "conversion_rate",
        "click_to_cart_rate",
        "cart_to_pay_rate",
        "click_conversion_rate",
        "pay_conversion_rate",
        "visitor_pay_conversion_rate",
        "click_add_to_cart_rate",
        "add_to_cart_rate",
        "点击率",
        "点击加购率",
        "加购率",
        "加购转化率",
        "转化率",
        "访客支付转化率",
        "支付转化率",
    ]
    .iter()
    .any(|pattern| normalized.contains(pattern))
}

pub(crate) fn is_integer_percent_key(key: &str) -> bool {
    let normalized = key.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }

    if normalized.contains("contribution_value") {
        return false;
    }

    if normalized == "wow" || normalized.ends_with("_wow") {
        return true;
    }

    if normalized == "contribution" || normalized == "share" {
        return true;
    }

    [
        "change_rate",
        "growth",
        "growth_rate",
        "delta_contribution",
        "contribution_rate",
        "gmv_delta_contribution",
        "pay_amount_delta_contribution",
        "环比",
        "同比",
        "涨幅",
        "降幅",
        "增幅",
        "占比",
        "贡献率",
    ]
    .iter()
    .any(|pattern| normalized.contains(pattern))
}

pub(crate) fn is_integer_display_metric_key(key: &str) -> bool {
    let normalized = key.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }

    if normalized.contains("contribution_value")
        || normalized.contains("ln_contribution")
        || normalized.contains("ratio")
    {
        return false;
    }

    if normalized.ends_with("_count") || normalized.ends_with("_amount") {
        return true;
    }

    if normalized.ends_with("_gmv") {
        return true;
    }

    [
        "gmv",
        "prev_gmv",
        "gmv_delta",
        "orders",
        "uv",
        "visitor_count",
        "buyer_count",
        "pay_buyer_count",
        "cart_buyer_count",
        "avg_order_value",
        "curr_avg_order_value",
        "prev_avg_order_value",
        "arpu",
        "uv_value",
        "客单价",
        "人均",
    ]
    .iter()
    .any(|pattern| normalized == *pattern || normalized.contains(pattern))
}
