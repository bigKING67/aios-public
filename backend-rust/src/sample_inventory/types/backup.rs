use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub(crate) struct SampleInventoryBackupSettings {
    #[serde(rename = "lowStockThreshold")]
    pub(crate) low_stock_threshold: i32,
    #[serde(rename = "refreshIntervalSeconds")]
    pub(crate) refresh_interval_seconds: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub(crate) struct SampleInventoryBackupSample {
    pub(crate) id: i64,
    #[serde(rename = "sampleCode")]
    pub(crate) sample_code: String,
    #[serde(rename = "sampleName")]
    pub(crate) sample_name: String,
    pub(crate) model: Option<String>,
    pub(crate) category: Option<String>,
    pub(crate) location: Option<String>,
    pub(crate) remark: Option<String>,
    #[serde(rename = "onHandQuantity")]
    pub(crate) on_hand_quantity: i32,
    #[serde(rename = "reservedQuantity")]
    pub(crate) reserved_quantity: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub(crate) struct SampleInventoryBackupInbound {
    pub(crate) id: i64,
    #[serde(rename = "sampleId")]
    pub(crate) sample_id: i64,
    pub(crate) quantity: i32,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
    pub(crate) remark: Option<String>,
    #[serde(rename = "operatorName")]
    pub(crate) operator_name: Option<String>,
    #[serde(rename = "occurredAt")]
    pub(crate) occurred_at: String,
    #[serde(rename = "timeQuality")]
    pub(crate) time_quality: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub(crate) struct SampleInventoryBackupOutbound {
    pub(crate) id: i64,
    #[serde(rename = "sampleId")]
    pub(crate) sample_id: i64,
    pub(crate) quantity: i32,
    pub(crate) applicant: String,
    pub(crate) department: String,
    pub(crate) purpose: String,
    pub(crate) receiver: Option<String>,
    #[serde(rename = "shippingAddress")]
    pub(crate) shipping_address: Option<String>,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
    pub(crate) status: String,
    #[serde(rename = "requestedAt")]
    pub(crate) requested_at: String,
    #[serde(rename = "approvedAt")]
    pub(crate) approved_at: Option<String>,
    #[serde(rename = "sampledAt")]
    pub(crate) sampled_at: Option<String>,
    #[serde(rename = "rejectedAt")]
    pub(crate) rejected_at: Option<String>,
    #[serde(rename = "timeQuality")]
    pub(crate) time_quality: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub(crate) struct SampleInventoryBackupState {
    pub(crate) settings: SampleInventoryBackupSettings,
    pub(crate) samples: Vec<SampleInventoryBackupSample>,
    #[serde(rename = "inboundRecords")]
    pub(crate) inbound_records: Vec<SampleInventoryBackupInbound>,
    #[serde(rename = "outboundRequests")]
    pub(crate) outbound_requests: Vec<SampleInventoryBackupOutbound>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryBackupFile {
    #[serde(rename = "schemaVersion")]
    pub(crate) schema_version: String,
    #[serde(rename = "exportedAt")]
    pub(crate) exported_at: String,
    #[serde(rename = "databaseIdentitySha256")]
    pub(crate) database_identity_sha256: String,
    #[serde(rename = "stateSha256")]
    pub(crate) state_sha256: String,
    pub(crate) state: SampleInventoryBackupState,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Default)]
pub(crate) struct SampleInventoryBackupPlanCounts {
    #[serde(rename = "settingsToUpdate")]
    pub(crate) settings_to_update: i64,
    #[serde(rename = "samplesToUpdate")]
    pub(crate) samples_to_update: i64,
    #[serde(rename = "samplesToArchive")]
    pub(crate) samples_to_archive: i64,
    #[serde(rename = "inboundsToUpdate")]
    pub(crate) inbounds_to_update: i64,
    #[serde(rename = "inboundsToVoid")]
    pub(crate) inbounds_to_void: i64,
    #[serde(rename = "outboundsToUpdate")]
    pub(crate) outbounds_to_update: i64,
    #[serde(rename = "outboundsToArchive")]
    pub(crate) outbounds_to_archive: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct ParseSampleInventoryBackupRequest {
    pub(crate) backup: SampleInventoryBackupFile,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryBackupPlanResponse {
    #[serde(rename = "schemaVersion")]
    pub(crate) schema_version: String,
    #[serde(rename = "backupSha256")]
    pub(crate) backup_sha256: String,
    #[serde(rename = "backupStateSha256")]
    pub(crate) backup_state_sha256: String,
    #[serde(rename = "currentStateSha256")]
    pub(crate) current_state_sha256: String,
    #[serde(rename = "planSha256")]
    pub(crate) plan_sha256: String,
    #[serde(rename = "sampleCount")]
    pub(crate) sample_count: i64,
    #[serde(rename = "inboundCount")]
    pub(crate) inbound_count: i64,
    #[serde(rename = "outboundCount")]
    pub(crate) outbound_count: i64,
    pub(crate) changes: SampleInventoryBackupPlanCounts,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct RestoreSampleInventoryBackupRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "expectedBackupSha256")]
    pub(crate) expected_backup_sha256: String,
    #[serde(rename = "expectedCurrentStateSha256")]
    pub(crate) expected_current_state_sha256: String,
    #[serde(rename = "expectedPlanSha256")]
    pub(crate) expected_plan_sha256: String,
    pub(crate) backup: SampleInventoryBackupFile,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryBackupRestoreResponse {
    #[serde(rename = "backupSha256")]
    pub(crate) backup_sha256: String,
    #[serde(rename = "restoredStateSha256")]
    pub(crate) restored_state_sha256: String,
    #[serde(rename = "planSha256")]
    pub(crate) plan_sha256: String,
    #[serde(rename = "restoredAt")]
    pub(crate) restored_at: String,
    pub(crate) changes: SampleInventoryBackupPlanCounts,
}
