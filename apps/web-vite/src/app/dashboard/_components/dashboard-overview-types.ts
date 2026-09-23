import type { QueryPlatform } from './dashboard-config';
import type { NumericInput } from './dashboard-formatters';

export interface DashboardOverviewQueryParams {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: QueryPlatform;
  includePlatformShare: boolean;
}

export interface DashboardOverviewCacheEntry {
  expiresAt: number;
  payload: DashboardOverviewApiResponse;
}

export type DashboardOverviewInFlightRequest = Promise<DashboardOverviewApiResponse>;

export interface DashboardOverviewSeriesRow {
  date: string;
  gmv: NumericInput;
  user_pay_amount: NumericInput;
  gsv_pay_time_current: NumericInput;
  gsv_pay_time_predicted: NumericInput;
  gsv_refund_time: NumericInput;
  refund_amount_pay_time_current: NumericInput;
  refund_amount_pay_time_predicted: NumericInput;
  refund_amount_refund_time: NumericInput;
  refund_rate_pay_time_current: NumericInput;
  refund_rate_pay_time_predicted: NumericInput;
  refund_rate_refund_time: NumericInput;
  gsv: NumericInput;
  refund_rate: NumericInput;
  order_count: NumericInput;
  buyer_count: NumericInput;
}

export interface DashboardOverviewTotals {
  gmv: NumericInput;
  user_pay_amount: NumericInput;
  gsv_pay_time_current: NumericInput;
  gsv_pay_time_predicted: NumericInput;
  gsv_refund_time: NumericInput;
  refund_amount_pay_time_current: NumericInput;
  refund_amount_pay_time_predicted: NumericInput;
  refund_amount_refund_time: NumericInput;
  refund_rate_pay_time_current: NumericInput;
  refund_rate_pay_time_predicted: NumericInput;
  refund_rate_refund_time: NumericInput;
  gsv: NumericInput;
  order_count: NumericInput;
  buyer_count: NumericInput;
  arpu: NumericInput;
  refund_rate: NumericInput;
}

export interface DashboardOverviewPlatformItem {
  platform: Exclude<QueryPlatform, 'overview'>;
  gmv: NumericInput;
  gsvPayTimeCurrent: NumericInput;
}

export type DashboardOverviewCarrierKey =
  | 'live'
  | 'short_video'
  | 'product_card'
  | 'image_text'
  | 'other';

export type DashboardOverviewCarrierType =
  | '直播'
  | '短视频'
  | '商品卡'
  | '图文'
  | '其他';

export interface DashboardOverviewCarrierCard {
  key: DashboardOverviewCarrierKey;
  carrier_type: DashboardOverviewCarrierType;
  label: string;
  trade_amount: NumericInput;
  previous_trade_amount: NumericInput;
  change_rate: NumericInput;
}

export interface DashboardOverviewNowcastQuality {
  asOfDate: string | null;
  evalAgeDays: NumericInput;
  evalWindowDays: NumericInput;
  thresholdWape: NumericInput;
  sampleCount: NumericInput;
  actualTotal: NumericInput;
  predictedTotal: NumericInput;
  absoluteErrorTotal: NumericInput;
  zeroMissCount?: NumericInput;
  wape: NumericInput;
  biasRate: NumericInput;
  qualityStatus: string | null;
  modelVersion?: string | null;
  alertPlatforms?: string[];
  passPlatforms?: string[];
  insufficientPlatforms?: string[];
}

export interface DashboardOverviewApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: QueryPlatform;
  nowcastAsOfDate?: string | null;
  nowcastQuality?: DashboardOverviewNowcastQuality | null;
  currentSeries: DashboardOverviewSeriesRow[];
  previousSeries: DashboardOverviewSeriesRow[];
  currentTotals: DashboardOverviewTotals;
  previousTotals: DashboardOverviewTotals;
  platformCurrent: DashboardOverviewPlatformItem[];
  carrierCards?: DashboardOverviewCarrierCard[];
}

export interface DashboardOverviewDetailRow {
  date: string;
  platform: string;
  gmv: NumericInput;
  user_pay_amount: NumericInput;
  cost: NumericInput;
  gmv_from_cost: NumericInput;
  roi: NumericInput;
  roi_from_cost: NumericInput;
  order_count: NumericInput;
  buyer_count: NumericInput;
  arpu: NumericInput;
  refund_amount_pay_time_current: NumericInput;
  refund_amount_pay_time_predicted: NumericInput;
  completeness_ratio: NumericInput;
  prediction_confidence: string | null;
  quality_status: string | null;
  refund_amount_refund_time: NumericInput;
  gsv_pay_time_current: NumericInput;
  gsv_pay_time_predicted: NumericInput;
  gsv_refund_time: NumericInput;
  refund_rate_pay_time_current: NumericInput;
  refund_rate_pay_time_predicted: NumericInput;
  refund_rate_refund_time: NumericInput;
  gsv: NumericInput;
  refund_rate: NumericInput;
}

export interface DashboardOverviewDetailExportApiResponse {
  startDate: string;
  endDate: string;
  platform: QueryPlatform;
  nowcastAsOfDate?: string | null;
  rows: DashboardOverviewDetailRow[];
}
