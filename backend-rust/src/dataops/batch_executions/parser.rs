use chrono::Utc;
use serde_json::Value;
use uuid::Uuid;

use super::super::time::parse_dataops_time;
use super::super::types::{
    BatchExecutionSaveRequest, DataOpsBatchExecutionItem, DataOpsBatchExecutionRecord,
};
use super::sanitize::{sanitize_batch_parameters, to_non_negative_i64};

pub(super) fn parse_batch_execution_request(
    payload: BatchExecutionSaveRequest,
    operator: String,
) -> Result<DataOpsBatchExecutionRecord, String> {
    let action = payload.action.unwrap_or_default().trim().to_string();
    if !["trigger_pipeline", "pause_deployment", "resume_deployment"].contains(&action.as_str()) {
        return Err("action 非法，仅支持 trigger/pause/resume 批量动作".to_string());
    }

    let label = payload.label.unwrap_or_default().trim().to_string();
    if label.is_empty() {
        return Err("label 不能为空".to_string());
    }

    let executed_at = payload.executed_at.unwrap_or_default().trim().to_string();
    if parse_dataops_time(executed_at.as_str()).is_none() {
        return Err("executedAt 非法，必须为有效时间字符串".to_string());
    }

    let total_count = to_non_negative_i64(payload.total_count.as_ref())
        .ok_or_else(|| "total/success/failed/skipped 必须是非负整数".to_string())?;
    let success_count = to_non_negative_i64(payload.success_count.as_ref())
        .ok_or_else(|| "total/success/failed/skipped 必须是非负整数".to_string())?;
    let failed_count = to_non_negative_i64(payload.failed_count.as_ref())
        .ok_or_else(|| "total/success/failed/skipped 必须是非负整数".to_string())?;
    let skipped_count = to_non_negative_i64(payload.skipped_count.as_ref())
        .ok_or_else(|| "total/success/failed/skipped 必须是非负整数".to_string())?;

    if success_count + failed_count + skipped_count != total_count {
        return Err("统计字段不一致：success + failed + skipped 必须等于 total".to_string());
    }

    let items = parse_batch_execution_items(payload.items.unwrap_or_default())?;

    if items.len() as i64 != total_count {
        return Err("items 数量必须与 totalCount 一致".to_string());
    }

    let parameters = payload
        .parameters
        .map(|map| sanitize_batch_parameters(&map));
    let parameters = parameters.filter(|map| !map.is_empty());

    Ok(DataOpsBatchExecutionRecord {
        id: format!(
            "batch_exec_{}_{}",
            Utc::now().timestamp_millis(),
            Uuid::new_v4().simple()
        ),
        action,
        label,
        executed_at: parse_dataops_time(executed_at.as_str())
            .map(|time| time.to_rfc3339())
            .unwrap_or(executed_at),
        total_count,
        success_count,
        failed_count,
        skipped_count,
        operator: if operator.trim().is_empty() {
            "dataops.user".to_string()
        } else {
            operator
        },
        parameters,
        items,
    })
}

fn parse_batch_execution_items(
    raw_items: Vec<Value>,
) -> Result<Vec<DataOpsBatchExecutionItem>, String> {
    let mut items: Vec<DataOpsBatchExecutionItem> = Vec::new();
    for raw in raw_items.into_iter().take(1000) {
        if let Ok(item) = serde_json::from_value::<DataOpsBatchExecutionItem>(raw) {
            if item.pipeline_id.trim().is_empty()
                || item.pipeline_name.trim().is_empty()
                || item.message.trim().is_empty()
                || !["success", "failed", "skipped"].contains(&item.status.as_str())
            {
                continue;
            }
            items.push(item);
        }
    }

    if items.is_empty() {
        return Err("items 不能为空".to_string());
    }

    Ok(items)
}
