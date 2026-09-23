pub(super) fn truncate_text(value: &str, limit: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= limit {
        return trimmed.to_string();
    }

    let mut output = String::new();
    for ch in trimmed.chars().take(limit) {
        output.push(ch);
    }
    output.push_str("...");
    output
}
