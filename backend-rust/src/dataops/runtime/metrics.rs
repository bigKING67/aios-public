use super::super::types::{
    DataOpsNotificationChannel, DataOpsRuntimeMetrics, DataOpsRuntimePipeline,
    DataOpsRuntimeSyncStream,
};

pub(super) fn build_runtime_metrics(
    pipelines: &[DataOpsRuntimePipeline],
    sync_streams: &[DataOpsRuntimeSyncStream],
    channels: &[DataOpsNotificationChannel],
) -> DataOpsRuntimeMetrics {
    let total = pipelines.len() as i64;
    let healthy = pipelines
        .iter()
        .filter(|item| item.pipeline.status == "healthy")
        .count() as i64;
    let warning = pipelines
        .iter()
        .filter(|item| item.pipeline.status == "warning")
        .count() as i64;
    let error = pipelines
        .iter()
        .filter(|item| item.pipeline.status == "error")
        .count() as i64;
    let paused = pipelines
        .iter()
        .filter(|item| item.pipeline.status == "paused")
        .count() as i64;

    let avg_lag_minutes = if sync_streams.is_empty() {
        0
    } else {
        sync_streams
            .iter()
            .map(|item| item.computed_lag_minutes)
            .sum::<i64>()
            / (sync_streams.len() as i64)
    };

    let notification_failure_count24h = channels
        .iter()
        .map(|item| item.failure_count24h)
        .sum::<i64>();
    let healthy_rate = if total == 0 {
        0
    } else {
        ((healthy as f64 / total as f64) * 100.0).round() as i64
    };

    DataOpsRuntimeMetrics {
        total_pipelines: total,
        healthy_pipelines: healthy,
        warning_pipelines: warning,
        error_pipelines: error,
        paused_pipelines: paused,
        avg_lag_minutes,
        notification_failure_count24h,
        healthy_rate,
    }
}
