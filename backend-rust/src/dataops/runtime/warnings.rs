use std::collections::HashSet;

pub(super) fn append_runtime_store_read_warning(
    warnings: &mut Vec<String>,
    label: &str,
    warning: Option<&String>,
) {
    if let Some(message) = warning {
        warnings.push(format!(
            "DataOps runtime {label} 读取 PostgreSQL 失败，已回退内存存储：{message}"
        ));
    }
}

pub(super) fn dedupe_warnings(warnings: Vec<String>, max_len: usize) -> Vec<String> {
    let mut set = HashSet::new();
    let mut result = Vec::new();

    for warning in warnings {
        let normalized = warning.trim();
        if normalized.is_empty() {
            continue;
        }
        if set.insert(normalized.to_string()) {
            result.push(normalized.to_string());
        }
        if result.len() >= max_len {
            break;
        }
    }

    result
}
