pub(crate) const DEFAULT_TRACE_LIMIT: usize = 400;
pub(crate) const MAX_TRACE_LIMIT: usize = 1200;

pub(crate) const DEFAULT_LOOKBACK_HOURS: i64 = 24;
pub(crate) const DEFAULT_MAX_GROUPS: usize = 30;
pub(crate) const DEFAULT_GROUP_EVENT_LIMIT: usize = 1200;
pub(crate) const FALLBACK_SCAN_CONCURRENCY: usize = 4;
pub(crate) const MAX_SCAN_CONCURRENCY: usize = 12;

pub(crate) const MAX_WARNING_ITEMS: usize = 120;
pub(crate) const WARNING_TRUNCATED_TEXT: &str = "巡检告警条目过多，已截断展示。";

pub(crate) const DATAOPS_MISSING_REASON_HASH_KEY: &str = "__missing__";
