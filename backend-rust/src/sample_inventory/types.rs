use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

mod backup;

pub(crate) use backup::*;

#[derive(Debug, Serialize)]
pub(crate) struct SampleInventoryAccessPolicyResponse {
    pub(crate) mode: String,
    #[serde(rename = "anonymousRead")]
    pub(crate) anonymous_read: bool,
    #[serde(rename = "anonymousWrite")]
    pub(crate) anonymous_write: bool,
}

#[derive(Debug, Deserialize, Default)]
pub(crate) struct SampleListQuery {
    pub(crate) keyword: Option<String>,
    pub(crate) include_archived: Option<bool>,
    #[serde(rename = "stockStatus")]
    pub(crate) stock_status: Option<String>,
    #[serde(rename = "productKind")]
    pub(crate) product_kind: Option<String>,
    pub(crate) page: Option<i64>,
    pub(crate) page_size: Option<i64>,
    #[serde(rename = "dateFrom")]
    pub(crate) date_from: Option<String>,
    #[serde(rename = "dateTo")]
    pub(crate) date_to: Option<String>,
    #[serde(rename = "sortBy")]
    pub(crate) sort_by: Option<String>,
    #[serde(rename = "sortOrder")]
    pub(crate) sort_order: Option<String>,
}

#[derive(Debug)]
pub(crate) struct NormalizedSampleListQuery {
    pub(crate) keyword: Option<String>,
    pub(crate) include_archived: bool,
    pub(crate) stock_status: Option<String>,
    pub(crate) product_kind: Option<String>,
    pub(crate) page: i64,
    pub(crate) page_size: i64,
    pub(crate) date_from: Option<DateTime<Utc>>,
    pub(crate) date_to: Option<DateTime<Utc>>,
    pub(crate) sort_by: String,
    pub(crate) sort_order: String,
}

#[derive(Debug, Deserialize, Default)]
pub(crate) struct InboundListQuery {
    pub(crate) keyword: Option<String>,
    pub(crate) sample_id: Option<i64>,
    pub(crate) include_voided: Option<bool>,
    pub(crate) page: Option<i64>,
    pub(crate) page_size: Option<i64>,
    #[serde(rename = "dateFrom")]
    pub(crate) date_from: Option<String>,
    #[serde(rename = "dateTo")]
    pub(crate) date_to: Option<String>,
    #[serde(rename = "sortBy")]
    pub(crate) sort_by: Option<String>,
    #[serde(rename = "sortOrder")]
    pub(crate) sort_order: Option<String>,
}

#[derive(Debug)]
pub(crate) struct NormalizedInboundListQuery {
    pub(crate) keyword: Option<String>,
    pub(crate) sample_id: Option<i64>,
    pub(crate) include_voided: bool,
    pub(crate) page: i64,
    pub(crate) page_size: i64,
    pub(crate) date_from: Option<DateTime<Utc>>,
    pub(crate) date_to: Option<DateTime<Utc>>,
    pub(crate) sort_by: String,
    pub(crate) sort_order: String,
}

#[derive(Debug, Deserialize, Default)]
pub(crate) struct OutboundListQuery {
    pub(crate) keyword: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) sample_id: Option<i64>,
    pub(crate) page: Option<i64>,
    pub(crate) page_size: Option<i64>,
    #[serde(rename = "dateFrom")]
    pub(crate) date_from: Option<String>,
    #[serde(rename = "dateTo")]
    pub(crate) date_to: Option<String>,
    #[serde(rename = "sortBy")]
    pub(crate) sort_by: Option<String>,
    #[serde(rename = "sortOrder")]
    pub(crate) sort_order: Option<String>,
}

#[derive(Debug)]
pub(crate) struct NormalizedOutboundListQuery {
    pub(crate) keyword: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) sample_id: Option<i64>,
    pub(crate) page: i64,
    pub(crate) page_size: i64,
    pub(crate) date_from: Option<DateTime<Utc>>,
    pub(crate) date_to: Option<DateTime<Utc>>,
    pub(crate) sort_by: String,
    pub(crate) sort_order: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventorySettingsResponse {
    #[serde(rename = "lowStockThreshold")]
    pub(crate) low_stock_threshold: i32,
    #[serde(rename = "refreshIntervalSeconds")]
    pub(crate) refresh_interval_seconds: i32,
    pub(crate) version: i64,
    #[serde(rename = "updatedAt")]
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct UpdateSampleInventorySettingsRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
    #[serde(rename = "lowStockThreshold")]
    pub(crate) low_stock_threshold: Option<i32>,
    #[serde(rename = "refreshIntervalSeconds")]
    pub(crate) refresh_interval_seconds: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventorySampleItem {
    pub(crate) id: i64,
    #[serde(rename = "sampleCode")]
    pub(crate) sample_code: String,
    #[serde(rename = "sampleName")]
    pub(crate) sample_name: String,
    pub(crate) model: Option<String>,
    pub(crate) category: Option<String>,
    #[serde(rename = "productKind")]
    pub(crate) product_kind: String,
    pub(crate) location: Option<String>,
    pub(crate) remark: Option<String>,
    #[serde(rename = "onHandQuantity")]
    pub(crate) on_hand_quantity: i32,
    #[serde(rename = "reservedQuantity")]
    pub(crate) reserved_quantity: i32,
    #[serde(rename = "availableQuantity")]
    pub(crate) available_quantity: i32,
    #[serde(rename = "isLowStock")]
    pub(crate) is_low_stock: bool,
    pub(crate) version: i64,
    #[serde(rename = "createdAt")]
    pub(crate) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(crate) updated_at: String,
    #[serde(rename = "archivedAt")]
    pub(crate) archived_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub(crate) struct SampleInventorySummary {
    #[serde(rename = "sampleCount")]
    pub(crate) sample_count: i64,
    #[serde(rename = "availableSampleCount")]
    pub(crate) available_sample_count: i64,
    #[serde(rename = "lowStockCount")]
    pub(crate) low_stock_count: i64,
    #[serde(rename = "totalOnHand")]
    pub(crate) total_on_hand: i64,
    #[serde(rename = "totalReserved")]
    pub(crate) total_reserved: i64,
    #[serde(rename = "totalAvailable")]
    pub(crate) total_available: i64,
    #[serde(rename = "pendingOutboundCount")]
    pub(crate) pending_outbound_count: i64,
    #[serde(rename = "approvedOutboundCount")]
    pub(crate) approved_outbound_count: i64,
    #[serde(rename = "sampledOutboundCount")]
    pub(crate) sampled_outbound_count: i64,
    #[serde(rename = "rejectedOutboundCount")]
    pub(crate) rejected_outbound_count: i64,
    #[serde(rename = "outboundRequestCount")]
    pub(crate) outbound_request_count: i64,
    #[serde(rename = "totalOutboundQuantity")]
    pub(crate) total_outbound_quantity: i64,
    #[serde(rename = "outboundApplicantCount")]
    pub(crate) outbound_applicant_count: i64,
    #[serde(rename = "inboundRecordCount")]
    pub(crate) inbound_record_count: i64,
    #[serde(rename = "totalInboundQuantity")]
    pub(crate) total_inbound_quantity: i64,
    #[serde(rename = "todayInboundQuantity")]
    pub(crate) today_inbound_quantity: i64,
    #[serde(rename = "inboundOperatorCount")]
    pub(crate) inbound_operator_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventorySampleListResponse {
    pub(crate) items: Vec<SampleInventorySampleItem>,
    pub(crate) total: i64,
    pub(crate) page: i64,
    #[serde(rename = "pageSize")]
    pub(crate) page_size: i64,
    pub(crate) summary: SampleInventorySummary,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct CreateSampleInventorySampleRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "sampleCode")]
    pub(crate) sample_code: String,
    #[serde(rename = "sampleName")]
    pub(crate) sample_name: String,
    pub(crate) model: Option<String>,
    pub(crate) category: Option<String>,
    pub(crate) location: Option<String>,
    pub(crate) remark: Option<String>,
    #[serde(rename = "initialQuantity")]
    pub(crate) initial_quantity: Option<i32>,
    #[serde(rename = "reservedQuantity")]
    pub(crate) reserved_quantity: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct UpdateSampleInventorySampleRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
    #[serde(rename = "sampleCode")]
    pub(crate) sample_code: String,
    #[serde(rename = "sampleName")]
    pub(crate) sample_name: String,
    pub(crate) model: Option<String>,
    pub(crate) category: Option<String>,
    pub(crate) location: Option<String>,
    pub(crate) remark: Option<String>,
    #[serde(rename = "reservedQuantity")]
    pub(crate) reserved_quantity: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryAdjustmentRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
    #[serde(rename = "quantityDelta")]
    pub(crate) quantity_delta: i32,
    pub(crate) reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct ArchiveSampleInventorySampleRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryInboundItem {
    pub(crate) id: i64,
    #[serde(rename = "sampleId")]
    pub(crate) sample_id: i64,
    #[serde(rename = "sampleCode")]
    pub(crate) sample_code: String,
    #[serde(rename = "sampleName")]
    pub(crate) sample_name: String,
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
    pub(crate) version: i64,
    #[serde(rename = "createdAt")]
    pub(crate) created_at: String,
    #[serde(rename = "voidedAt")]
    pub(crate) voided_at: Option<String>,
    #[serde(rename = "voidReason")]
    pub(crate) void_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryInboundListResponse {
    pub(crate) items: Vec<SampleInventoryInboundItem>,
    pub(crate) total: i64,
    pub(crate) page: i64,
    #[serde(rename = "pageSize")]
    pub(crate) page_size: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct CreateSampleInventoryInboundRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "sampleId")]
    pub(crate) sample_id: i64,
    pub(crate) quantity: i32,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
    pub(crate) remark: Option<String>,
    #[serde(rename = "operatorName")]
    pub(crate) operator_name: Option<String>,
    #[serde(rename = "occurredAt")]
    pub(crate) occurred_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct CreateSampleInventoryInboundItem {
    #[serde(rename = "sampleId")]
    pub(crate) sample_id: i64,
    pub(crate) quantity: i32,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
    pub(crate) remark: Option<String>,
    #[serde(rename = "operatorName")]
    pub(crate) operator_name: Option<String>,
    #[serde(rename = "occurredAt")]
    pub(crate) occurred_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct CreateSampleInventoryInboundBatchRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) items: Vec<CreateSampleInventoryInboundItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct VoidSampleInventoryInboundRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
    pub(crate) reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryInboundBatchResponse {
    pub(crate) items: Vec<SampleInventoryInboundItem>,
    #[serde(rename = "createdCount")]
    pub(crate) created_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryOutboundItem {
    pub(crate) id: i64,
    #[serde(rename = "sampleId")]
    pub(crate) sample_id: i64,
    #[serde(rename = "sampleCode")]
    pub(crate) sample_code: String,
    #[serde(rename = "sampleName")]
    pub(crate) sample_name: String,
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
    pub(crate) version: i64,
    #[serde(rename = "createdAt")]
    pub(crate) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryOutboundListResponse {
    pub(crate) items: Vec<SampleInventoryOutboundItem>,
    pub(crate) total: i64,
    pub(crate) page: i64,
    #[serde(rename = "pageSize")]
    pub(crate) page_size: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct CreateSampleInventoryOutboundRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "sampleId")]
    pub(crate) sample_id: i64,
    pub(crate) quantity: i32,
    pub(crate) applicant: String,
    pub(crate) department: String,
    pub(crate) purpose: String,
    pub(crate) receiver: String,
    #[serde(rename = "shippingAddress")]
    pub(crate) shipping_address: String,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
    #[serde(rename = "requestedAt")]
    pub(crate) requested_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct CreateSampleInventoryOutboundItem {
    #[serde(rename = "sampleId")]
    pub(crate) sample_id: i64,
    pub(crate) quantity: i32,
    pub(crate) applicant: String,
    pub(crate) department: String,
    pub(crate) purpose: String,
    pub(crate) receiver: String,
    #[serde(rename = "shippingAddress")]
    pub(crate) shipping_address: String,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
    #[serde(rename = "requestedAt")]
    pub(crate) requested_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct CreateSampleInventoryOutboundBatchRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) items: Vec<CreateSampleInventoryOutboundItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryOutboundBatchResponse {
    pub(crate) items: Vec<SampleInventoryOutboundItem>,
    #[serde(rename = "createdCount")]
    pub(crate) created_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct UpdateSampleInventoryOutboundRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
    #[serde(rename = "sampleId")]
    pub(crate) sample_id: i64,
    pub(crate) quantity: i32,
    pub(crate) applicant: String,
    pub(crate) department: String,
    pub(crate) purpose: String,
    pub(crate) receiver: String,
    #[serde(rename = "shippingAddress")]
    pub(crate) shipping_address: String,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct TransitionSampleInventoryOutboundRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
    #[serde(rename = "targetStatus")]
    pub(crate) target_status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryVersionTarget {
    pub(crate) id: i64,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct BatchTransitionSampleInventoryOutboundRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) items: Vec<SampleInventoryVersionTarget>,
    #[serde(rename = "targetStatus")]
    pub(crate) target_status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct BatchArchiveSampleInventoryOutboundRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) items: Vec<SampleInventoryVersionTarget>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct BatchArchiveSampleInventorySamplesRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) items: Vec<SampleInventoryVersionTarget>,
    pub(crate) reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventorySampleBatchMutationResponse {
    pub(crate) items: Vec<SampleInventorySampleItem>,
    #[serde(rename = "updatedCount")]
    pub(crate) updated_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct BatchVoidSampleInventoryInboundsRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) items: Vec<SampleInventoryVersionTarget>,
    pub(crate) reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryInboundBatchMutationResponse {
    pub(crate) items: Vec<SampleInventoryInboundItem>,
    #[serde(rename = "updatedCount")]
    pub(crate) updated_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct UpdateSampleInventoryOutboundTrackingRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct BatchUpdateSampleInventoryOutboundTrackingItem {
    pub(crate) id: i64,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct BatchUpdateSampleInventoryOutboundTrackingRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) items: Vec<BatchUpdateSampleInventoryOutboundTrackingItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct BatchEditSampleInventoryOutboundItem {
    pub(crate) id: i64,
    #[serde(rename = "expectedVersion")]
    pub(crate) expected_version: i64,
    pub(crate) applicant: Option<String>,
    pub(crate) department: Option<String>,
    pub(crate) purpose: Option<String>,
    pub(crate) receiver: Option<String>,
    #[serde(rename = "shippingAddress")]
    pub(crate) shipping_address: Option<String>,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct BatchEditSampleInventoryOutboundRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) items: Vec<BatchEditSampleInventoryOutboundItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryBatchMutationResponse {
    pub(crate) items: Vec<SampleInventoryOutboundItem>,
    #[serde(rename = "updatedCount")]
    pub(crate) updated_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryImportIssue {
    pub(crate) row: i32,
    pub(crate) field: String,
    pub(crate) message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventorySampleImportRow {
    #[serde(rename = "sampleCode")]
    pub(crate) sample_code: String,
    #[serde(rename = "sampleName")]
    pub(crate) sample_name: String,
    pub(crate) model: Option<String>,
    pub(crate) category: Option<String>,
    pub(crate) location: Option<String>,
    pub(crate) remark: Option<String>,
    #[serde(rename = "initialQuantity")]
    pub(crate) initial_quantity: i32,
}

#[derive(Debug, Serialize)]
pub(crate) struct SampleInventorySampleXlsxParseResponse {
    pub(crate) rows: Vec<SampleInventorySampleImportRow>,
    pub(crate) issues: Vec<SampleInventoryImportIssue>,
    #[serde(rename = "validCount")]
    pub(crate) valid_count: i64,
    #[serde(rename = "invalidCount")]
    pub(crate) invalid_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct ImportSampleInventorySamplesRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) rows: Vec<SampleInventorySampleImportRow>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventorySampleImportResponse {
    pub(crate) items: Vec<SampleInventorySampleItem>,
    #[serde(rename = "createdCount")]
    pub(crate) created_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct SampleInventoryInboundImportRow {
    #[serde(rename = "sampleCode")]
    pub(crate) sample_code: String,
    pub(crate) quantity: i32,
    #[serde(rename = "trackingNumber")]
    pub(crate) tracking_number: Option<String>,
    pub(crate) remark: Option<String>,
    #[serde(rename = "operatorName")]
    pub(crate) operator_name: Option<String>,
    #[serde(rename = "occurredAt")]
    pub(crate) occurred_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct SampleInventoryInboundXlsxParseResponse {
    pub(crate) rows: Vec<SampleInventoryInboundImportRow>,
    pub(crate) issues: Vec<SampleInventoryImportIssue>,
    #[serde(rename = "validCount")]
    pub(crate) valid_count: i64,
    #[serde(rename = "invalidCount")]
    pub(crate) invalid_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct ImportSampleInventoryInboundsRequest {
    #[serde(rename = "submissionKey")]
    pub(crate) submission_key: String,
    pub(crate) rows: Vec<SampleInventoryInboundImportRow>,
}
