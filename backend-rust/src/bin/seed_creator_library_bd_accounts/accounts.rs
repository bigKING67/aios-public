use std::{collections::BTreeMap, env};

use anyhow::anyhow;
use serde::Deserialize;

use super::constants::BD_ACCOUNT_MAP_ENV;

#[derive(Debug, Deserialize)]
pub(super) struct AccountMapping {
    username: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct ResolvedAccount {
    pub(super) username: String,
    pub(super) display_name: Option<String>,
}

pub(super) fn parse_account_map() -> anyhow::Result<BTreeMap<String, AccountMapping>> {
    let mut result = BTreeMap::new();
    result.insert(
        "darmadan".to_string(),
        AccountMapping {
            username: "darmadan".to_string(),
            display_name: Some("darmadan".to_string()),
        },
    );
    result.insert(
        "于悦".to_string(),
        AccountMapping {
            username: "yuyue".to_string(),
            display_name: Some("于悦".to_string()),
        },
    );

    let Ok(raw) = env::var(BD_ACCOUNT_MAP_ENV) else {
        return Ok(result);
    };
    let raw = raw.trim();
    if raw.is_empty() {
        return Ok(result);
    }

    let value: serde_json::Value = serde_json::from_str(raw)?;
    let Some(map) = value.as_object() else {
        return Err(anyhow!("{BD_ACCOUNT_MAP_ENV} must be a JSON object"));
    };
    for (alias, item) in map {
        let mapping = if let Some(username) = item.as_str() {
            AccountMapping {
                username: username.to_string(),
                display_name: Some(alias.to_string()),
            }
        } else {
            serde_json::from_value::<AccountMapping>(item.clone())?
        };
        result.insert(alias.trim().to_string(), mapping);
    }
    Ok(result)
}

pub(super) fn resolve_account(
    alias: &str,
    account_map: &BTreeMap<String, AccountMapping>,
) -> Option<ResolvedAccount> {
    if let Some(mapped) = account_map.get(alias) {
        return Some(ResolvedAccount {
            username: normalize_username(mapped.username.as_str())?,
            display_name: mapped
                .display_name
                .clone()
                .or_else(|| Some(alias.to_string())),
        });
    }

    normalize_username(alias).map(|username| ResolvedAccount {
        username,
        display_name: Some(alias.to_string()),
    })
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
