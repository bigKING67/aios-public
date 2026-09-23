use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct WeeklySummaryGeneratePayload {
    pub week_period: Option<String>,
    pub summary_scope: Option<String>,
    pub business_framework: Option<String>,
    pub custom_prompt: Option<String>,
    pub facts_data: Option<serde_json::Value>,
    pub provider: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub force_regenerate: bool,
    #[serde(default)]
    pub retry: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct WeeklySummaryManualUpdatePayload {
    pub week_period: Option<String>,
    pub summary_scope: Option<String>,
    pub conclusions: Conclusions,
    pub provider: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct Conclusions {
    pub(crate) overall: String,
    pub(crate) highlights: Vec<String>,
    pub(crate) risks: Vec<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct WeeklySummaryGenerateResponse {
    pub(crate) report_id: String,
    pub(crate) week_period: String,
    pub(crate) summary_scope: String,
    pub(crate) task_id: Option<String>,
    pub(crate) status: String,
    pub(crate) queued: bool,
    pub(crate) message: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct WeeklySummaryStatusResponse {
    pub(crate) report_id: String,
    pub(crate) week_period: String,
    pub(crate) summary_scope: String,
    pub(crate) triggered: bool,
    pub(crate) status: String,
    pub(crate) content_status: String,
    pub(crate) task_id: Option<String>,
    pub(crate) generated_at: Option<String>,
    pub(crate) error_msg: Option<String>,
    pub(crate) attempt_count: i32,
    pub(crate) provider: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) updated_by: Option<String>,
    pub(crate) approved_by: Option<String>,
    pub(crate) approved_at: Option<String>,
    pub(crate) published_by: Option<String>,
    pub(crate) published_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct WeeklySummaryContentResponse {
    pub(crate) week_period: String,
    pub(crate) summary_scope: String,
    pub(crate) status: String,
    pub(crate) content_status: String,
    pub(crate) task_id: Option<String>,
    pub(crate) provider: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) generated_at: Option<String>,
    pub(crate) updated_by: Option<String>,
    pub(crate) approved_by: Option<String>,
    pub(crate) approved_at: Option<String>,
    pub(crate) published_by: Option<String>,
    pub(crate) published_at: Option<String>,
    pub(crate) message: Option<String>,
    pub(crate) conclusions: Conclusions,
}
