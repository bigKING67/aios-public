use sha2::{Digest, Sha256};

pub(in crate::marketing::bd_accounts) fn username_for_alias(alias: &str) -> String {
    if let Some(username) = normalize_username(alias) {
        return username;
    }

    let digest = Sha256::digest(alias.trim().as_bytes());
    let hex = hex::encode(digest);
    format!("bd_{}", &hex[..10])
}

fn normalize_username(raw: &str) -> Option<String> {
    let normalized = raw
        .trim()
        .to_lowercase()
        .chars()
        .filter_map(|ch| {
            if ch.is_ascii_alphanumeric() {
                Some(ch)
            } else if matches!(ch, '-' | '_' | '.') {
                Some('_')
            } else {
                None
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}
