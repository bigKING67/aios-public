use super::super::common::{lock_detail_with_optional_warning, lock_fallback_warning_text};

pub(super) fn build_failed_lock_detail(
    message: &str,
    lock_mode: &str,
    lock_warning: Option<&String>,
) -> String {
    lock_detail_with_optional_warning(message, lock_mode, lock_warning)
}

pub(super) fn build_success_detail(
    trigger_url: &str,
    lock_mode: &str,
    lock_ttl_ms: i64,
    lock_warning: Option<&String>,
) -> String {
    let mut detail = format!(
        "http-trigger 成功，url={}，lockMode={}，lockTtlMs={}",
        trigger_url, lock_mode, lock_ttl_ms
    );
    if let Some(lock_warning) = lock_fallback_warning_text(lock_warning) {
        detail = format!("{}，lockWarning={}", detail, lock_warning);
    }
    detail
}
