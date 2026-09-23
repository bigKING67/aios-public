use std::{env, fs, path::Path};

use anyhow::Context;

pub(super) fn load_env_relaxed(path: &str) -> anyhow::Result<()> {
    let path = Path::new(path);
    if !path.exists() {
        return Ok(());
    }

    for raw_line in fs::read_to_string(path)?.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((raw_key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = raw_key.trim();
        if key.is_empty() || env::var(key).is_ok() {
            continue;
        }
        let value = raw_value.trim().trim_matches('"').trim_matches('\'');
        unsafe {
            env::set_var(key, value);
        }
    }
    Ok(())
}

pub(super) fn required_env(name: &str, error_message: &'static str) -> anyhow::Result<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .context(error_message)
}
