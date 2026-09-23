mod common;
mod goods;
mod monthly;
mod queries;
mod summary;
mod weekly;

pub(crate) use common::{
    Kpi, PeriodOption, PlatformData, ReportListItem, ReportsListResponse, TrendData, TrendPoint,
};
pub(crate) use goods::{
    GoodsAttributionData, GoodsChannelAttributionData, GoodsChannelAttributionItem,
    GoodsChannelDriverContribution, GoodsChannelFunnelDiagnosisData, GoodsChannelFunnelMetricItem,
    GoodsChannelQuantAttributionByChannel, GoodsChannelSelectionDetail, ProductAttributionItem,
};
pub(crate) use monthly::{
    MonthlyAggregate, MonthlyCharts, MonthlyLatestPeriodResponse, MonthlyMetadata,
    MonthlyPeriodsResponse, MonthlyReportResponse,
};
pub(crate) use queries::{
    ListReportsQuery, MonthlyPeriodQuery, MonthlyPeriodsQuery, WeekPeriodOptionalQuery,
    WeekPeriodQuery, WeekPeriodSummaryScopeQuery, WeeklyPeriodsQuery,
};
pub(crate) use summary::{
    Conclusions, WeeklySummaryContentResponse, WeeklySummaryGeneratePayload,
    WeeklySummaryGenerateResponse, WeeklySummaryManualUpdatePayload, WeeklySummaryStatusResponse,
};
pub(crate) use weekly::{
    WeeklyCharts, WeeklyLatestPeriodResponse, WeeklyMetadata, WeeklyPeriodsResponse,
    WeeklyReportResponse, WeeklyRow,
};
