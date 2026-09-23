use std::collections::HashMap;

use serde::Deserialize;

use super::{
    DataOpsAuditEvent, DataOpsFeishuSyncServiceDefinition, DataOpsNotificationChannel,
    DataOpsNotificationEvent, DataOpsPipeline, DataOpsTriggerParameterSpec, DataSyncStream,
};

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsStaticConfig {
    pub(crate) pipelines: Vec<DataOpsPipeline>,
    #[serde(rename = "syncStreams")]
    pub(crate) sync_streams: Vec<DataSyncStream>,
    #[serde(rename = "notificationChannels")]
    pub(crate) notification_channels: Vec<DataOpsNotificationChannel>,
    #[serde(rename = "notificationEvents")]
    pub(crate) notification_events: Vec<DataOpsNotificationEvent>,
    #[serde(rename = "auditEvents")]
    pub(crate) audit_events: Vec<DataOpsAuditEvent>,
    #[serde(rename = "triggerParameterSpecs")]
    pub(crate) trigger_parameter_specs: HashMap<String, Vec<DataOpsTriggerParameterSpec>>,
    #[serde(rename = "feishuSyncServiceDefinitions")]
    pub(crate) feishu_sync_service_definitions: Vec<DataOpsFeishuSyncServiceDefinition>,
    #[serde(rename = "feishuSyncTargetLabel")]
    pub(crate) feishu_sync_target_label: String,
    #[serde(rename = "feishuSyncHealthyLagMinutes")]
    pub(crate) feishu_sync_healthy_lag_minutes: i64,
    #[serde(rename = "feishuSyncWarningLagMinutes")]
    pub(crate) feishu_sync_warning_lag_minutes: i64,
}
