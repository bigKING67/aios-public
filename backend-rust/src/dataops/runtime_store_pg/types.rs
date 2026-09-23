#[derive(Clone)]
pub(crate) struct RuntimeStoreLimits {
    pub(crate) max_audit_events: usize,
    pub(crate) max_notification_events: usize,
    pub(crate) max_batch_execution_events: usize,
}

pub(crate) struct RuntimeCleanupState {
    pub(crate) retain_days: i64,
    pub(crate) last_cleanup_at: Option<String>,
    pub(crate) last_audit_deleted: Option<i64>,
    pub(crate) last_notification_deleted: Option<i64>,
    pub(crate) last_batch_execution_deleted: Option<i64>,
    pub(crate) updated_at: Option<String>,
}
