use std::time::Instant;

use chrono::Utc;
use tracing::info;

use crate::state::AppState;

use super::env::is_production;
use super::feishu_sync::build_feishu_sync_jobs;
use super::runtime_store::{
    build_runtime_store_status, list_audit_events_with_store,
    list_batch_execution_events_with_store, list_notification_events_with_store,
};
use super::time::format_shanghai_datetime_from_utc;
use super::types::DataOpsRuntimeResponse;
use super::DATAOPS_CONFIG;

mod metrics;
mod notifications;
mod pipelines;
mod status;
mod streams;
mod warnings;

use metrics::build_runtime_metrics;
use notifications::build_notification_channels;
use pipelines::build_runtime_pipelines;
use streams::build_sync_streams;
use warnings::{append_runtime_store_read_warning, dedupe_warnings};

pub(super) async fn build_runtime_response(
    state: &AppState,
) -> Result<DataOpsRuntimeResponse, String> {
    let response_started = Instant::now();
    let mut warnings: Vec<String> = Vec::new();

    let runtime_store = build_runtime_store_status(state).await;
    if !runtime_store.postgres.enabled || runtime_store.storage_mode == "memory" {
        warnings.push(
            "DataOps Rust 运行态当前使用内存存储，尚未启用 PostgreSQL runtime 表持久化。"
                .to_string(),
        );
    }

    let include_seed_events = !is_production();

    let pipeline_fetch_started = Instant::now();
    let (runtime_pipelines, pipeline_warnings, prefect_reachable) =
        build_runtime_pipelines(state).await;
    warnings.extend(pipeline_warnings);

    if !prefect_reachable {
        warnings.push("Prefect API 当前不可达，已回退到配置快照与最近可用运行态。".to_string());
    }

    let sync_streams = build_sync_streams(runtime_pipelines.as_slice());
    let feishu_sync_jobs = build_feishu_sync_jobs(
        state,
        &runtime_store,
        DATAOPS_CONFIG.feishu_sync_service_definitions.as_slice(),
        DATAOPS_CONFIG.feishu_sync_target_label.as_str(),
        DATAOPS_CONFIG.feishu_sync_healthy_lag_minutes,
        DATAOPS_CONFIG.feishu_sync_warning_lag_minutes,
        &mut warnings,
    )
    .await;

    let notification_events_read = list_notification_events_with_store(state).await;
    append_runtime_store_read_warning(
        &mut warnings,
        "通知事件",
        notification_events_read.warning.as_ref(),
    );
    let notification_events = notification_events_read.items;
    let notification_events = if include_seed_events && notification_events.is_empty() {
        DATAOPS_CONFIG
            .notification_events
            .iter()
            .take(80)
            .cloned()
            .collect::<Vec<_>>()
    } else {
        notification_events.into_iter().take(80).collect()
    };

    let notification_channels =
        build_notification_channels(notification_events.as_slice(), &mut warnings);

    let audit_events_read = list_audit_events_with_store(state).await;
    append_runtime_store_read_warning(
        &mut warnings,
        "审计事件",
        audit_events_read.warning.as_ref(),
    );
    let audit_events = audit_events_read.items;
    let audit_events = if include_seed_events && audit_events.is_empty() {
        DATAOPS_CONFIG
            .audit_events
            .iter()
            .take(80)
            .cloned()
            .collect::<Vec<_>>()
    } else {
        audit_events.into_iter().take(80).collect()
    };

    let batch_executions_read = list_batch_execution_events_with_store(state).await;
    append_runtime_store_read_warning(
        &mut warnings,
        "批量执行历史",
        batch_executions_read.warning.as_ref(),
    );
    let batch_executions = batch_executions_read.items;

    let metrics = build_runtime_metrics(
        runtime_pipelines.as_slice(),
        sync_streams.as_slice(),
        notification_channels.as_slice(),
    );

    let payload = DataOpsRuntimeResponse {
        snapshot_at: format_shanghai_datetime_from_utc(Utc::now()),
        pipelines: runtime_pipelines,
        sync_streams,
        feishu_sync_jobs,
        notification_channels,
        notification_events,
        audit_events,
        batch_executions,
        metrics,
        runtime_store,
        prefect_reachable,
        warnings: dedupe_warnings(warnings, 12),
    };

    info!(
        pipeline_count = payload.pipelines.len(),
        prefect_reachable = payload.prefect_reachable,
        runtime_store_mode = %payload.runtime_store.storage_mode,
        runtime_lock_mode = %payload.runtime_store.lock_mode,
        prefect_pipeline_ms = pipeline_fetch_started.elapsed().as_millis(),
        runtime_response_ms = response_started.elapsed().as_millis(),
        "dataops runtime response built"
    );

    Ok(payload)
}
