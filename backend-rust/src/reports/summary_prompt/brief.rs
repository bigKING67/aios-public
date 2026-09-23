pub(super) fn build_summary_facts_brief(facts: &serde_json::Value) -> String {
    let mut lines: Vec<String> = Vec::new();
    lines.push(format!(
        "summary_scope: {}",
        value_to_text(facts.get("summary_scope"))
    ));
    lines.push(format!(
        "week_period: {}",
        value_to_text(facts.get("week_period"))
    ));

    append_kpi_brief(&mut lines, facts);
    append_platform_brief(&mut lines, facts);
    append_tmall_snapshot_brief(&mut lines, facts);
    append_product_attribution_brief(&mut lines, facts);
    append_channel_attribution_brief(&mut lines, facts);

    lines.join("\n")
}

fn value_to_text(value: Option<&serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                "未提供".to_string()
            } else {
                trimmed.to_string()
            }
        }
        Some(serde_json::Value::Number(number)) => number.to_string(),
        Some(serde_json::Value::Bool(boolean)) => boolean.to_string(),
        _ => "未提供".to_string(),
    }
}

fn append_kpi_brief(lines: &mut Vec<String>, facts: &serde_json::Value) {
    if let Some(kpis) = facts.get("kpis").and_then(|value| value.as_array()) {
        for (index, kpi) in kpis.iter().take(6).enumerate() {
            let label = value_to_text(kpi.get("label"));
            let display_value = value_to_text(kpi.get("display_value"));
            let wow = value_to_text(kpi.get("wow"));
            lines.push(format!("kpi#{index}: {label}={display_value}, wow={wow}"));
        }
    }
}

fn append_platform_brief(lines: &mut Vec<String>, facts: &serde_json::Value) {
    if let Some(platforms) = facts.get("platforms").and_then(|value| value.as_array()) {
        let mut platform_name_list: Vec<String> = Vec::new();
        for (index, platform) in platforms.iter().take(6).enumerate() {
            let name = value_to_text(platform.get("name"));
            let gmv = value_to_text(platform.get("gmv"));
            let wow = value_to_text(platform.get("wow"));
            let contribution = value_to_text(platform.get("contribution"));
            if name != "未提供" {
                platform_name_list.push(name.clone());
            }
            lines.push(format!(
                "platform#{index}: {name}, gmv={gmv}, wow={wow}, contribution={contribution}"
            ));
        }

        if !platform_name_list.is_empty() {
            platform_name_list.sort();
            platform_name_list.dedup();
            lines.push(format!("platform_list: {}", platform_name_list.join("、")));
        }
    }
}

fn append_tmall_snapshot_brief(lines: &mut Vec<String>, facts: &serde_json::Value) {
    if let Some(snapshot) = facts
        .get("tmall_platform_snapshot")
        .and_then(|value| value.as_object())
    {
        let platform = value_to_text(snapshot.get("platform"));
        let gmv = value_to_text(snapshot.get("gmv"));
        let wow = value_to_text(snapshot.get("wow"));
        lines.push(format!(
            "tmall_snapshot: platform={platform}, gmv={gmv}, wow={wow}"
        ));
    }
}

fn append_product_attribution_brief(lines: &mut Vec<String>, facts: &serde_json::Value) {
    if let Some(items) = facts
        .get("product_attribution_top")
        .and_then(|value| value.as_array())
    {
        for (index, item) in items.iter().take(4).enumerate() {
            let product_name = value_to_text(item.get("product_name"));
            let gmv = value_to_text(item.get("gmv"));
            let gmv_delta = value_to_text(item.get("gmv_delta"));
            lines.push(format!(
                "product#{index}: {product_name}, gmv={gmv}, gmv_delta={gmv_delta}"
            ));
        }
    }
}

fn append_channel_attribution_brief(lines: &mut Vec<String>, facts: &serde_json::Value) {
    if let Some(items) = facts
        .get("channel_attribution_top")
        .and_then(|value| value.as_array())
    {
        for (index, item) in items.iter().take(4).enumerate() {
            let traffic_channel = value_to_text(item.get("traffic_channel"));
            let pay_amount = value_to_text(item.get("pay_amount"));
            let pay_amount_delta = value_to_text(item.get("pay_amount_delta"));
            lines.push(format!(
                "channel#{index}: {traffic_channel}, pay_amount={pay_amount}, pay_amount_delta={pay_amount_delta}"
            ));
        }
    }
}
