use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsRuntimeMetrics {
    pub(crate) total_pipelines: i64,
    pub(crate) healthy_pipelines: i64,
    pub(crate) warning_pipelines: i64,
    pub(crate) error_pipelines: i64,
    pub(crate) paused_pipelines: i64,
    pub(crate) avg_lag_minutes: i64,
    pub(crate) notification_failure_count24h: i64,
    pub(crate) healthy_rate: i64,
}
