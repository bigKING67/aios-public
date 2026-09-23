import {
  createFallbackWindowDaysParameter,
  createInitWatermarkOnlyParameter,
} from './dataops-trigger-param-builders';
import type {
  DataOpsTriggerParameterSpec,
  DataOpsTriggerParameterSpecsMap,
} from './dataops-trigger-param-types';

function createWeeklyReportIncrementalParameters(): DataOpsTriggerParameterSpec[] {
  return [
    createFallbackWindowDaysParameter({
      max: 60,
      defaultValue: 14,
    }),
    createInitWatermarkOnlyParameter(),
  ];
}

export const DATAOPS_WEEKLY_REPORT_TRIGGER_PARAMETER_SPECS: DataOpsTriggerParameterSpecsMap = {
  ads_report_all_trade_week_platform_metrics_incremental: createWeeklyReportIncrementalParameters(),
  ads_report_douyin_trade_sale_metrics_week_incremental: createWeeklyReportIncrementalParameters(),
  ads_report_douyin_trade_sale_channel_metrics_week_incremental: createWeeklyReportIncrementalParameters(),
  ads_report_douyin_trade_sale_attribution_metrics_week_incremental: createWeeklyReportIncrementalParameters(),
  ads_report_taobao_trade_product_metrics_week_incremental: createWeeklyReportIncrementalParameters(),
  ads_report_taobao_goods_traffic_channel_metrics_week_incremental: createWeeklyReportIncrementalParameters(),
  ads_report_taobao_one_goods_traffic_channel_metric_week_incremental: createWeeklyReportIncrementalParameters(),
};
