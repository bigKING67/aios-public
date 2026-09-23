use serde_json::Value;

use super::super::types::{
    DataOpsActionRequest, DataOpsFeishuSyncServiceDefinition, DataOpsPipeline,
};

pub(crate) const DATAOPS_TRIGGER_LOCK_NAMESPACE: &str = "dataops-trigger";

pub(crate) fn resolve_pipeline(pipeline_id: Option<&str>) -> Option<DataOpsPipeline> {
    let pipeline_id = pipeline_id?.trim();
    if pipeline_id.is_empty() {
        return None;
    }

    super::super::DATAOPS_CONFIG
        .pipelines
        .iter()
        .find(|item| item.id == pipeline_id)
        .cloned()
}

pub(crate) fn get_feishu_sync_service_definitions() -> &'static [DataOpsFeishuSyncServiceDefinition]
{
    super::super::DATAOPS_CONFIG
        .feishu_sync_service_definitions
        .as_slice()
}

pub(crate) fn parse_action_request(payload: Value) -> Option<DataOpsActionRequest> {
    let request = serde_json::from_value::<DataOpsActionRequest>(payload).ok()?;

    let action = request.action.trim().to_string();
    if action.is_empty() {
        return None;
    }

    if ![
        "trigger_pipeline",
        "pause_deployment",
        "resume_deployment",
        "test_channel_webhook",
        "trigger_feishu_sync",
    ]
    .contains(&action.as_str())
    {
        return None;
    }

    Some(DataOpsActionRequest { action, ..request })
}

pub(crate) fn lock_fallback_warning_text(warning: Option<&String>) -> Option<String> {
    warning.map(|message| {
        format!(
            "{}；postgresError={}",
            super::super::LOCK_MEMORY_FALLBACK_WARNING,
            message
        )
    })
}

pub(crate) fn lock_warning_value(warning: Option<&String>) -> Value {
    match lock_fallback_warning_text(warning) {
        Some(message) => Value::String(message),
        None => Value::Null,
    }
}

pub(crate) fn lock_detail_with_optional_warning(
    message: &str,
    mode: &str,
    warning: Option<&String>,
) -> String {
    let mut detail = format!("{}，lockMode={}", message, mode);
    if let Some(lock_warning) = lock_fallback_warning_text(warning) {
        detail = format!("{}，lockWarning={}", detail, lock_warning);
    }
    detail
}
