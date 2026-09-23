pub(super) fn strip_code_fence(raw: &str) -> String {
    let mut value = raw.trim().to_string();
    if value.starts_with("```") {
        value = value
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
            .to_string();
    }
    value
}
