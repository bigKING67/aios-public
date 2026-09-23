use serde::{Deserialize, Serialize};

fn default_batch_trigger_allowed() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsPipeline {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) domain: String,
    pub(crate) flow_name: String,
    pub(crate) deployment_name: String,
    pub(crate) cron: String,
    pub(crate) timezone: String,
    #[serde(default)]
    pub(crate) fallback_window_days: Option<i64>,
    #[serde(default)]
    pub(crate) source_tables: Vec<String>,
    #[serde(default)]
    pub(crate) target_tables: Vec<String>,
    #[serde(default)]
    pub(crate) procedures: Vec<String>,
    #[serde(default)]
    pub(crate) watermark_table: Option<String>,
    pub(crate) owner: String,
    pub(crate) status: String,
    pub(crate) last_run_at: String,
    #[serde(default)]
    pub(crate) last_success_at: Option<String>,
    pub(crate) avg_duration_sec: f64,
    #[serde(default)]
    pub(crate) linux_deploy_script: Option<String>,
    #[serde(default)]
    pub(crate) linux_deploy_command: Option<String>,
    #[serde(default = "default_batch_trigger_allowed")]
    pub(crate) batch_trigger_allowed: bool,
    #[serde(default)]
    pub(crate) note: Option<String>,
}
