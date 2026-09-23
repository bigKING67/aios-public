import {
  createFallbackWindowDaysParameter,
  createInitWatermarkOnlyParameter,
} from './dataops-trigger-param-builders';
import type {
  DataOpsTriggerParameterSpecsMap,
} from './dataops-trigger-param-types';

const FALLBACK_WINDOW_DAYS_DESCRIPTION = '对应 Prefect 参数 fallback_window_days。';

export const DATAOPS_DASHBOARD_TRIGGER_PARAMETER_SPECS: DataOpsTriggerParameterSpecsMap = {
  ads_all_trade_overview_incremental: [
    createFallbackWindowDaysParameter({
      max: 60,
      defaultValue: 7,
      description: FALLBACK_WINDOW_DAYS_DESCRIPTION,
    }),
    createInitWatermarkOnlyParameter('true 时只初始化水位，不执行日汇总刷新。'),
  ],
  ads_taobao_trade_sale_goods_daily_incremental: [
    createFallbackWindowDaysParameter({
      max: 90,
      defaultValue: 14,
      description: FALLBACK_WINDOW_DAYS_DESCRIPTION,
    }),
    createInitWatermarkOnlyParameter('true 时只初始化水位，不执行天猫商品成交日粒度增量刷新。'),
  ],
  ads_taobao_traffic_shop_daily_incremental: [
    createFallbackWindowDaysParameter({
      max: 90,
      defaultValue: 14,
      description: FALLBACK_WINDOW_DAYS_DESCRIPTION,
    }),
    createInitWatermarkOnlyParameter('true 时只初始化水位，不执行天猫店铺流量日粒度增量刷新。'),
  ],
  ads_taobao_traffic_goods_daily_incremental: [
    createFallbackWindowDaysParameter({
      max: 90,
      defaultValue: 14,
      description: FALLBACK_WINDOW_DAYS_DESCRIPTION,
    }),
    createInitWatermarkOnlyParameter('true 时只初始化水位，不执行天猫商品流量日粒度增量刷新。'),
  ],
  ads_douyin_live_detail_incremental: [
    createFallbackWindowDaysParameter({
      max: 90,
      defaultValue: 14,
      description: FALLBACK_WINDOW_DAYS_DESCRIPTION,
    }),
    createInitWatermarkOnlyParameter('true 时只初始化水位，不执行抖音直播明细看板增量刷新。'),
  ],
  ads_douyin_live_goods_detail_incremental: [
    createFallbackWindowDaysParameter({
      max: 90,
      defaultValue: 14,
      description: FALLBACK_WINDOW_DAYS_DESCRIPTION,
    }),
    createInitWatermarkOnlyParameter('true 时只初始化水位，不执行抖音直播商品明细看板增量刷新。'),
  ],
  ads_douyin_shortvideo_detail_incremental: [
    createFallbackWindowDaysParameter({
      max: 90,
      defaultValue: 14,
      description: FALLBACK_WINDOW_DAYS_DESCRIPTION,
    }),
    createInitWatermarkOnlyParameter('true 时只初始化水位，不执行抖音短视频明细看板增量刷新。'),
  ],
  ads_creator_live_dashboard_incremental: [
    createFallbackWindowDaysParameter({
      max: 60,
      defaultValue: 14,
      description: FALLBACK_WINDOW_DAYS_DESCRIPTION,
    }),
    createInitWatermarkOnlyParameter('true 时只初始化水位，不执行直播达人看板增量刷新。'),
  ],
};
