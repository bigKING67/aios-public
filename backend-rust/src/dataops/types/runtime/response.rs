use serde::Serialize;

use super::super::{
    DataOpsAuditEvent, DataOpsBatchExecutionRecord, DataOpsNotificationChannel,
    DataOpsNotificationEvent,
};
use super::{
    feishu_sync::DataOpsRuntimeFeishuSyncJob,
    metrics::DataOpsRuntimeMetrics,
    pipeline::{DataOpsRuntimePipeline, DataOpsRuntimeSyncStream},
    store::DataOpsRuntimeStoreStatus,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsRuntimeResponse {
    pub(crate) snapshot_at: String,
    pub(crate) pipelines: Vec<DataOpsRuntimePipeline>,
    pub(crate) sync_streams: Vec<DataOpsRuntimeSyncStream>,
    pub(crate) feishu_sync_jobs: Vec<DataOpsRuntimeFeishuSyncJob>,
    pub(crate) notification_channels: Vec<DataOpsNotificationChannel>,
    pub(crate) notification_events: Vec<DataOpsNotificationEvent>,
    pub(crate) audit_events: Vec<DataOpsAuditEvent>,
    pub(crate) batch_executions: Vec<DataOpsBatchExecutionRecord>,
    pub(crate) metrics: DataOpsRuntimeMetrics,
    pub(crate) runtime_store: DataOpsRuntimeStoreStatus,
    pub(crate) prefect_reachable: bool,
    pub(crate) warnings: Vec<String>,
}
