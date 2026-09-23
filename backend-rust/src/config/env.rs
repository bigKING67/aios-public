use std::{env, fs};

pub(super) fn load_env_relaxed(path: &str) -> anyhow::Result<()> {
    let content = fs::read_to_string(path)?;

    for raw_line in content.lines() {
        let line = raw_line.trim();

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let Some((raw_key, raw_value)) = line.split_once('=') else {
            continue;
        };

        let key = raw_key.trim();
        if key.is_empty() {
            continue;
        }

        let value = strip_wrapping_quotes(raw_value.trim());
        if env::var(key).is_err() {
            unsafe {
                env::set_var(key, value);
            }
        }
    }

    Ok(())
}

fn strip_wrapping_quotes(raw: &str) -> &str {
    if raw.len() >= 2 {
        let bytes = raw.as_bytes();
        let first = bytes[0];
        let last = bytes[raw.len() - 1];

        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return &raw[1..raw.len() - 1];
        }
    }

    raw
}

pub(super) fn env_var_or(key: &str, default_value: &str) -> String {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_value.to_string())
}

pub(super) fn parse_env_bool(key: &str, default_value: bool) -> bool {
    parse_bool_value(
        env_var_or(key, if default_value { "true" } else { "false" }).as_str(),
        default_value,
    )
}

fn parse_bool_value(value: &str, default_value: bool) -> bool {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "y" | "on" => true,
        "0" | "false" | "no" | "n" | "off" => false,
        _ => default_value,
    }
}

pub(super) fn required_env(key: &str) -> anyhow::Result<String> {
    let value = env::var(key)
        .map_err(|_| anyhow::anyhow!("missing required env: {key}"))?
        .trim()
        .to_string();

    if value.is_empty() {
        return Err(anyhow::anyhow!("missing required env: {key}"));
    }

    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::parse_bool_value;

    #[test]
    fn parse_bool_value_preserves_safe_defaults_for_unknown_values() {
        assert!(parse_bool_value("yes", false));
        assert!(!parse_bool_value("off", true));
        assert!(parse_bool_value("unexpected", true));
        assert!(!parse_bool_value("unexpected", false));
    }
}
