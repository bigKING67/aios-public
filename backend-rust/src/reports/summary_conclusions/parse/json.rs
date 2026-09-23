use super::super::super::Conclusions;

pub(in crate::reports) fn parse_summary_conclusions(
    summary_text: &str,
) -> anyhow::Result<Conclusions> {
    let parsed: serde_json::Value = serde_json::from_str(summary_text)?;

    let overall = parsed
        .get("overall")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();

    if overall.is_empty() {
        anyhow::bail!("missing overall");
    }

    let highlights = normalize_string_array(parsed.get("highlights"));
    let risks = normalize_string_array(parsed.get("risks"));

    Ok(Conclusions {
        overall,
        highlights,
        risks,
    })
}

fn normalize_string_array(value: Option<&serde_json::Value>) -> Vec<String> {
    match value {
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .filter_map(|item| item.as_str())
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect(),
        Some(serde_json::Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![trimmed.to_string()]
            }
        }
        _ => Vec::new(),
    }
}
