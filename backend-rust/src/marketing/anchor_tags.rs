use std::collections::HashSet;

const CLOTHING_ANCHOR_TAG: &str = "服饰主播";
const CLOTHING_ANCHOR_TAG_ALIASES: &[&str] = &[
    "服饰",
    "服装",
    "服饰类",
    "服装类",
    "服饰主播",
    "服装主播",
    "服饰达人",
    "服装达人",
    "服饰类主播",
    "服装类主播",
    "服饰垂类主播",
    "服装垂类主播",
    "服饰类达人",
    "服装类达人",
    "服饰垂类达人",
    "服装垂类达人",
];

pub(super) fn normalize_anchor_tag_text(value: String) -> Option<String> {
    let normalized = value
        .trim()
        .replace('\u{feff}', "")
        .replace(char::is_whitespace, "");
    if normalized.is_empty() {
        return None;
    }

    let normalized = normalize_anchor_tag_role_suffix(normalized.as_str());

    if is_clothing_anchor_tag(normalized.as_str()) {
        Some(CLOTHING_ANCHOR_TAG.to_string())
    } else {
        Some(normalized)
    }
}

pub(super) fn normalize_anchor_tag_key(value: &str) -> String {
    value
        .trim()
        .replace('\u{feff}', "")
        .replace(char::is_whitespace, "")
        .replace('（', "(")
        .replace('）', ")")
        .to_lowercase()
}

pub(super) fn expand_anchor_tag_filter_values(value: &str) -> Vec<String> {
    let Some(normalized) = normalize_anchor_tag_text(value.to_string()) else {
        return Vec::new();
    };

    if is_clothing_anchor_tag(normalized.as_str()) {
        return CLOTHING_ANCHOR_TAG_ALIASES
            .iter()
            .map(|alias| (*alias).to_string())
            .collect();
    }

    let mut values = vec![normalized.clone()];
    if let Some(base) = normalized.strip_suffix("主播") {
        values.push(format!("{}垂类主播", base));
        values.push(format!("{}类主播", base));
    }
    dedup_anchor_tags(values, 20)
}

pub(super) fn dedup_anchor_tags(values: Vec<String>, limit: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let key = normalize_anchor_tag_key(value.as_str());
        if seen.insert(key) {
            result.push(value);
        }
        if result.len() >= limit {
            break;
        }
    }
    result
}

fn is_clothing_anchor_tag(value: &str) -> bool {
    let key = normalize_anchor_tag_key(value);
    CLOTHING_ANCHOR_TAG_ALIASES
        .iter()
        .any(|alias| normalize_anchor_tag_key(alias) == key)
}

fn normalize_anchor_tag_role_suffix(value: &str) -> String {
    value
        .trim()
        .replace("垂类主播", "主播")
        .replace("类主播", "主播")
}

#[cfg(test)]
mod tests {
    use super::{expand_anchor_tag_filter_values, normalize_anchor_tag_text};

    #[test]
    fn normalizes_only_clear_clothing_aliases() {
        let cases = [
            ("服饰", "服饰主播"),
            ("服装", "服饰主播"),
            ("服装类达人", "服饰主播"),
            ("美奢垂类主播", "美奢主播"),
            ("美奢类主播", "美奢主播"),
            ("穿搭", "穿搭"),
            ("女装", "女装"),
            ("美妆", "美妆"),
            ("彩妆", "彩妆"),
            ("个护", "个护"),
        ];

        for (input, expected) in cases {
            assert_eq!(
                normalize_anchor_tag_text(input.to_string()).as_deref(),
                Some(expected)
            );
        }
    }

    #[test]
    fn expands_clothing_filter_without_expanding_other_categories() {
        let clothing_values = expand_anchor_tag_filter_values("服装主播");
        assert!(clothing_values.contains(&"服饰主播".to_string()));
        assert!(clothing_values.contains(&"服装主播".to_string()));
        assert!(clothing_values.contains(&"服装垂类主播".to_string()));
        assert!(!clothing_values.contains(&"穿搭".to_string()));

        assert_eq!(
            expand_anchor_tag_filter_values("美妆"),
            vec!["美妆".to_string()]
        );
        assert_eq!(
            expand_anchor_tag_filter_values("美奢垂类主播"),
            vec![
                "美奢主播".to_string(),
                "美奢垂类主播".to_string(),
                "美奢类主播".to_string()
            ]
        );
    }
}
