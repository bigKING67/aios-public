use super::super::super::types::{DataOpsActionRequest, DataOpsFeishuSyncServiceDefinition};
use super::super::common::get_feishu_sync_service_definitions;

pub(super) fn resolve_requested_service_name(request: &DataOpsActionRequest) -> Option<String> {
    request
        .parameters
        .as_ref()
        .and_then(|params| params.get("service_name").and_then(|item| item.as_str()))
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

pub(super) fn resolve_feishu_sync_definition(
    service_name: Option<&str>,
) -> Result<Option<DataOpsFeishuSyncServiceDefinition>, String> {
    let Some(service_name) = service_name else {
        return Ok(None);
    };

    let found = get_feishu_sync_service_definitions()
        .iter()
        .find(|item| item.service_name == service_name)
        .cloned();

    match found {
        Some(value) => Ok(Some(value)),
        None => {
            let support = get_feishu_sync_service_definitions()
                .iter()
                .map(|item| item.service_name.clone())
                .collect::<Vec<_>>()
                .join("、");
            Err(format!("service_name 不合法，仅支持：{}", support))
        }
    }
}
