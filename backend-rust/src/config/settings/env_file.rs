use std::path::Path;

use super::super::env::load_env_relaxed;

pub(super) fn load_env_file_if_present(path: &str) {
    if let Err(error) = load_env_relaxed(path) {
        if Path::new(path).exists() {
            eprintln!("warning: failed to load {path} file: {error}");
        }
    }
}
