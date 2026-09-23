use super::super::types::DataOpsFeishuSyncServiceDefinition;
use super::states::FeishuSyncState;

pub(super) fn build_feishu_sync_note(
    definition: &DataOpsFeishuSyncServiceDefinition,
    sync_state: Option<&FeishuSyncState>,
    lag_minutes: Option<i64>,
    warning_lag_minutes: i64,
) -> Option<String> {
    if let Some(note) = definition
        .note
        .clone()
        .filter(|item| !item.trim().is_empty())
    {
        return Some(note);
    }

    let Some(state) = sync_state else {
        return Some("尚未采集到同步水位，请检查 run_feishu_sync 执行环境。".to_string());
    };

    if let Some(lag_minutes) = lag_minutes {
        if lag_minutes > warning_lag_minutes {
            return Some(format!(
                "同步水位来自 {}，但已超过 {} 分钟未更新。",
                state.service_name, lag_minutes
            ));
        }
    }

    None
}
