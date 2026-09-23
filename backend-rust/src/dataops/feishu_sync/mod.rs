use std::collections::HashMap;

use chrono::Utc;

use crate::state::AppState;

use self::{
    note::build_feishu_sync_note, states::fetch_feishu_sync_states,
    status::resolve_feishu_sync_status,
};
use super::time::format_shanghai_datetime_from_utc;
use super::types::{
    DataOpsFeishuSyncServiceDefinition, DataOpsRuntimeFeishuSyncJob, DataOpsRuntimeStoreStatus,
};

mod note;
mod states;
mod status;
mod table;

pub(super) async fn build_feishu_sync_jobs(
    state: &AppState,
    runtime_store: &DataOpsRuntimeStoreStatus,
    service_definitions: &[DataOpsFeishuSyncServiceDefinition],
    target_label: &str,
    healthy_lag_minutes: i64,
    warning_lag_minutes: i64,
    warnings: &mut Vec<String>,
) -> Vec<DataOpsRuntimeFeishuSyncJob> {
    let default_status = if runtime_store.postgres.enabled {
        "warning"
    } else {
        "paused"
    };
    let sync_states = if runtime_store.postgres.enabled {
        match fetch_feishu_sync_states(state).await {
            Ok(states) => states,
            Err(message) => {
                warnings.push(message);
                HashMap::new()
            }
        }
    } else {
        HashMap::new()
    };

    let now = Utc::now();

    service_definitions
        .iter()
        .map(|definition| {
            let sync_state = sync_states.get(definition.service_name.as_str());
            let lag_minutes = sync_state.map(|item| {
                now.signed_duration_since(item.updated_at)
                    .num_minutes()
                    .max(0)
            });
            let status = sync_state
                .map(|_| {
                    resolve_feishu_sync_status(
                        lag_minutes.unwrap_or(0),
                        healthy_lag_minutes,
                        warning_lag_minutes,
                    )
                })
                .unwrap_or_else(|| default_status.to_string());

            DataOpsRuntimeFeishuSyncJob {
                id: definition.id.clone(),
                service_name: definition.service_name.clone(),
                job_name: definition.job_name.clone(),
                source_table: definition.source_table.clone(),
                target: target_label.to_string(),
                status,
                last_synced_at: sync_state
                    .map(|item| format_shanghai_datetime_from_utc(item.updated_at)),
                lag_minutes,
                last_watermark: sync_state.and_then(|item| item.last_watermark.clone()),
                last_primary_key: sync_state.and_then(|item| item.last_primary_key.clone()),
                note: build_feishu_sync_note(
                    definition,
                    sync_state,
                    lag_minutes,
                    warning_lag_minutes,
                ),
            }
        })
        .collect()
}
