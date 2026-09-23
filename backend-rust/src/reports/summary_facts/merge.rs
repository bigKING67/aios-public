pub(crate) fn merge_summary_facts(
    auto_facts: serde_json::Value,
    custom_facts: serde_json::Value,
) -> serde_json::Value {
    fn merge_value(base: serde_json::Value, overlay: serde_json::Value) -> serde_json::Value {
        match (base, overlay) {
            (serde_json::Value::Object(mut base_map), serde_json::Value::Object(overlay_map)) => {
                for (key, value) in overlay_map {
                    let base_value = base_map
                        .remove(key.as_str())
                        .unwrap_or(serde_json::Value::Null);
                    base_map.insert(key, merge_value(base_value, value));
                }
                serde_json::Value::Object(base_map)
            }
            (base_value, serde_json::Value::Null) => base_value,
            (_, overlay_value) => overlay_value,
        }
    }

    merge_value(auto_facts, custom_facts)
}
