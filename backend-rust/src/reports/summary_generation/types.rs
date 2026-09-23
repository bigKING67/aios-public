use chrono::{DateTime, Utc};

#[derive(Debug)]
pub(crate) struct WeeklySummaryRecord {
    pub(crate) summary_text: Option<String>,
    pub(crate) status: String,
    pub(crate) content_status: String,
    pub(crate) generated_at: Option<DateTime<Utc>>,
    pub(crate) error_msg: Option<String>,
    pub(crate) task_id: Option<String>,
    pub(crate) provider: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) updated_by: Option<String>,
    pub(crate) approved_by: Option<String>,
    pub(crate) approved_at: Option<DateTime<Utc>>,
    pub(crate) published_by: Option<String>,
    pub(crate) published_at: Option<DateTime<Utc>>,
    pub(crate) attempt_count: i32,
}

#[derive(Debug)]
pub(crate) struct PreparedSummaryTask {
    pub(crate) should_enqueue: bool,
    pub(crate) status: String,
    pub(crate) task_id: String,
}
