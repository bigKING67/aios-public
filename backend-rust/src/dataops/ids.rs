use chrono::Utc;
use uuid::Uuid;

pub(in crate::dataops) fn build_runtime_id(prefix: &str) -> String {
    format!(
        "{}_{}_{}",
        prefix,
        Utc::now().timestamp_millis(),
        Uuid::new_v4().simple()
    )
}
