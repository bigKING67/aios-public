use std::collections::HashMap;

use chrono::Utc;
use once_cell::sync::Lazy;

use super::super::time::{format_shanghai_datetime_from_ts, to_dataops_timestamp};
use super::super::types::{DataOpsRuntimePipeline, DataOpsRuntimeSyncStream};
use super::super::DATAOPS_CONFIG;
use super::status::resolve_stream_status_by_lag;

static STREAM_PIPELINE_MAP: Lazy<HashMap<&'static str, Vec<&'static str>>> = Lazy::new(|| {
    HashMap::from([
        (
            "stream_trade_overview",
            vec!["ads_all_trade_overview_incremental"],
        ),
        (
            "stream_taobao_trade_sale_goods_daily",
            vec!["ads_taobao_trade_sale_goods_daily_incremental"],
        ),
        (
            "stream_taobao_traffic_shop_daily",
            vec!["ads_taobao_traffic_shop_daily_incremental"],
        ),
        (
            "stream_taobao_traffic_goods_daily",
            vec!["ads_taobao_traffic_goods_daily_incremental"],
        ),
        (
            "stream_report_all_trade_week_platform_metrics",
            vec!["ads_report_all_trade_week_platform_metrics_incremental"],
        ),
        (
            "stream_report_douyin_trade_sale_metrics_week",
            vec!["ads_report_douyin_trade_sale_metrics_week_incremental"],
        ),
        (
            "stream_report_douyin_trade_sale_channel_metrics_week",
            vec!["ads_report_douyin_trade_sale_channel_metrics_week_incremental"],
        ),
        (
            "stream_report_douyin_trade_sale_attribution_metrics_week",
            vec!["ads_report_douyin_trade_sale_attribution_metrics_week_incremental"],
        ),
        (
            "stream_report_taobao_trade_product_metrics_week",
            vec!["ads_report_taobao_trade_product_metrics_week_incremental"],
        ),
        (
            "stream_report_taobao_goods_traffic_channel_metrics_week",
            vec!["ads_report_taobao_goods_traffic_channel_metrics_week_incremental"],
        ),
        (
            "stream_report_taobao_one_goods_traffic_channel_metric_week",
            vec!["ads_report_taobao_one_goods_traffic_channel_metric_week_incremental"],
        ),
    ])
});

pub(super) fn build_sync_streams(
    pipelines: &[DataOpsRuntimePipeline],
) -> Vec<DataOpsRuntimeSyncStream> {
    let pipeline_map = pipelines
        .iter()
        .map(|item| (item.pipeline.id.clone(), item.clone()))
        .collect::<HashMap<_, _>>();

    let now_ts = Utc::now().timestamp_millis();

    DATAOPS_CONFIG
        .sync_streams
        .iter()
        .map(|stream| {
            let linked_pipeline_ids = STREAM_PIPELINE_MAP
                .get(stream.id.as_str())
                .cloned()
                .unwrap_or_default();
            let linked_pipelines = linked_pipeline_ids
                .iter()
                .filter_map(|pipeline_id| pipeline_map.get(*pipeline_id))
                .cloned()
                .collect::<Vec<_>>();

            let latest_pipeline_ts = linked_pipelines
                .iter()
                .map(|item| {
                    item.pipeline
                        .last_success_at
                        .as_ref()
                        .map(|value| to_dataops_timestamp(value.as_str()))
                        .unwrap_or(0)
                })
                .max()
                .unwrap_or(0);

            let fallback_ts = to_dataops_timestamp(stream.last_sync_at.as_str());
            let effective_ts = if latest_pipeline_ts > 0 {
                latest_pipeline_ts
            } else {
                fallback_ts
            };

            let computed_lag_minutes = if effective_ts > 0 {
                ((now_ts - effective_ts) / 60_000).max(0)
            } else {
                stream.lag_minutes
            };

            let status = resolve_stream_status_by_lag(
                stream,
                computed_lag_minutes,
                linked_pipelines.as_slice(),
            );

            let mut next_stream = stream.clone();
            next_stream.status = status;
            next_stream.lag_minutes = computed_lag_minutes;
            if effective_ts > 0 {
                next_stream.last_sync_at = format_shanghai_datetime_from_ts(effective_ts);
            }

            DataOpsRuntimeSyncStream {
                stream: next_stream,
                computed_lag_minutes,
            }
        })
        .collect()
}
