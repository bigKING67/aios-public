fn has_non_empty_array_field(facts: &serde_json::Value, key: &str) -> bool {
    facts
        .get(key)
        .and_then(|value| value.as_array())
        .map(|items| !items.is_empty())
        .unwrap_or(false)
}

fn has_non_empty_object_field(facts: &serde_json::Value, key: &str) -> bool {
    facts
        .get(key)
        .and_then(|value| value.as_object())
        .map(|items| !items.is_empty())
        .unwrap_or(false)
}

pub(in crate::reports) fn has_minimum_summary_facts(
    summary_scope: &str,
    facts: &serde_json::Value,
) -> bool {
    if summary_scope == super::super::WEEKLY_SUMMARY_SCOPE_TMALL {
        let snapshot_ok = has_non_empty_object_field(facts, "tmall_platform_snapshot");
        let product_ok = has_non_empty_array_field(facts, "product_attribution_top");
        let channel_ok = has_non_empty_array_field(facts, "channel_attribution_top");
        let diagnosis_ok = has_non_empty_array_field(facts, "channel_diagnosis");
        return snapshot_ok && (product_ok || channel_ok || diagnosis_ok);
    }

    let kpis_ok = has_non_empty_array_field(facts, "kpis");
    let platforms_ok = has_non_empty_array_field(facts, "platforms");
    kpis_ok && platforms_ok
}
