use std::sync::Arc;

use axum::Router;

use crate::state::AppState;

mod cache;
mod cache_runtime;
mod cache_warmup;
mod factor_reason;
mod handler_cache;
mod handlers;
mod list_handlers;
mod metrics;
mod monthly;
mod monthly_handlers;
mod monthly_report;
mod periods;
mod quant_attribution;
mod summary_conclusions;
mod summary_content;
mod summary_facts;
mod summary_generation;
mod summary_handlers;
mod summary_jobs;
mod summary_normalization;
#[cfg(test)]
mod summary_percentage_tests;
mod summary_prompt;
mod summary_storage;
mod traffic_channel;
mod types;
mod weekly;
mod weekly_douyin_card;
mod weekly_douyin_card_ads;
mod weekly_douyin_live;
mod weekly_douyin_scope;
mod weekly_douyin_shortvideo;
mod weekly_goods;
mod weekly_goods_channel;
mod weekly_goods_channel_funnel;
mod weekly_handlers;
mod weekly_platforms;
mod weekly_query;
mod weekly_report;
mod weekly_trends;

use monthly::{build_monthly_conclusions, build_monthly_kpis, build_monthly_platform_data};
use periods::{month_start_end, normalize_week_period_for_api, parse_month_period};
use types::{
    Conclusions, GoodsAttributionData, GoodsChannelAttributionData, GoodsChannelAttributionItem,
    GoodsChannelDriverContribution, GoodsChannelFunnelDiagnosisData, GoodsChannelFunnelMetricItem,
    GoodsChannelQuantAttributionByChannel, GoodsChannelSelectionDetail, Kpi, MonthlyAggregate,
    MonthlyCharts, MonthlyMetadata, MonthlyReportResponse, PeriodOption, PlatformData,
    ProductAttributionItem, TrendData, TrendPoint, WeekPeriodSummaryScopeQuery, WeeklyCharts,
    WeeklyMetadata, WeeklyReportResponse, WeeklyRow, WeeklySummaryContentResponse,
    WeeklySummaryManualUpdatePayload, WeeklySummaryStatusResponse,
};
use weekly::{build_weekly_conclusions, build_weekly_kpis};
use weekly_douyin_card::build_weekly_douyin_card_attribution;
use weekly_douyin_live::build_weekly_douyin_live_attribution;
use weekly_douyin_shortvideo::build_weekly_douyin_shortvideo_attribution;
use weekly_goods::build_weekly_goods_attribution;
use weekly_goods_channel::build_weekly_goods_channel_attribution;
use weekly_goods_channel_funnel::build_weekly_goods_channel_funnel_diagnosis;
use weekly_platforms::build_weekly_platforms;
use weekly_query::query_all_trade_week;
use weekly_trends::{build_weekly_trends, extract_period_dates};

use weekly_report::build_weekly_report;
const REPORT_READ_PERMISSIONS: [&str; 4] = [
    "reports:read",
    "report:view:all",
    "report:view:shared",
    "report:view:own",
];
const REPORT_SUMMARY_GENERATE_PERMISSIONS: [&str; 3] = [
    "reports:summary:generate",
    "report:summary:generate",
    "report:summary:manage",
];
const REPORT_SUMMARY_EDIT_PERMISSIONS: [&str; 3] = [
    "reports:summary:edit",
    "report:summary:edit",
    "report:summary:manage",
];
const WEEKLY_SUMMARY_SCOPE_GLOBAL: &str = "global";
const WEEKLY_SUMMARY_SCOPE_OVERVIEW: &str = "overview";
const WEEKLY_SUMMARY_SCOPE_TMALL: &str = "tmall";
const WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT: &str = "AI_DRAFT";
const WEEKLY_SUMMARY_CONTENT_STATUS_MANUAL_EDITED: &str = "MANUAL_EDITED";
const DOUYIN_CARD_SOURCE_CHANNELS: [&str; 12] = [
    "分享",
    "合作达人",
    "商城其他",
    "底tab-我",
    "搜索",
    "消息",
    "猜你喜欢",
    "直播间溢出",
    "短视频溢出",
    "购后页面",
    "购物车",
    "通用功能",
];

pub fn router() -> Router<Arc<AppState>> {
    handlers::router()
}

pub fn spawn_report_cache_warmup(state: Arc<AppState>) {
    cache_warmup::spawn_report_cache_warmup(state);
}
