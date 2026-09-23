pub(super) const DEFAULT_SLO_ENABLED: bool = true;
pub(super) const DEFAULT_SLO_AUTO_NOTIFY_ENABLED: bool = false;
pub(super) const DEFAULT_SLO_RECOVERY_THRESHOLD: i64 = 70;
pub(super) const DEFAULT_SLO_MIN_FIRST_FAILED_COUNT: i64 = 3;
pub(super) const DEFAULT_SLO_COOLDOWN_MINUTES: i64 = 30;
pub(super) const DEFAULT_SLO_MAX_REASON_ITEMS: usize = 3;
pub(super) const DEFAULT_SLO_NOTIFICATION_CHANNEL_ID: &str = "feishu_default_bot";
pub(super) const DEFAULT_SLO_OPERATOR: &str = "dataops.slo.bot";

pub(super) const SLO_LOCK_MEMORY_FALLBACK_WARNING: &str =
    "SLO 冷却锁已回退内存模式（仅当前实例生效）。";
