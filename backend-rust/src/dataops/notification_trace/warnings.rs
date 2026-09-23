use std::collections::HashSet;

use super::constants::{MAX_WARNING_ITEMS, WARNING_TRUNCATED_TEXT};

pub(crate) fn append_unique_warning(
    list: &mut Vec<String>,
    set: &mut HashSet<String>,
    raw_warning: &str,
) {
    let warning = raw_warning.trim();
    if warning.is_empty() {
        return;
    }

    if set.contains(warning) {
        return;
    }

    if list.len() >= MAX_WARNING_ITEMS {
        if !set.contains(WARNING_TRUNCATED_TEXT) {
            set.insert(WARNING_TRUNCATED_TEXT.to_string());
            list.push(WARNING_TRUNCATED_TEXT.to_string());
        }
        return;
    }

    set.insert(warning.to_string());
    list.push(warning.to_string());
}
