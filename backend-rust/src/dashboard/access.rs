pub(super) fn normalize_text_input(raw: Option<&str>) -> String {
    raw.unwrap_or_default().trim().to_string()
}

fn normalize_role(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .map(|char| {
            if char.is_whitespace() || char == '-' {
                '_'
            } else {
                char
            }
        })
        .collect::<String>()
}

pub(super) fn has_any_role(roles: &[String], candidates: &[&str]) -> bool {
    let role_set = roles
        .iter()
        .map(|role| normalize_role(role.as_str()))
        .collect::<std::collections::HashSet<_>>();

    candidates
        .iter()
        .map(|candidate| normalize_role(candidate))
        .any(|candidate| role_set.contains(candidate.as_str()))
}
