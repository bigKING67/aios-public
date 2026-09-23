import type { DashboardLiveDataDateBounds } from './dashboard-live-types';
import type { DashboardTrafficMetricTriplet, TrafficMetricFormat } from './dashboard-traffic-types';
import type { NumericInput } from './dashboard-formatters';

export interface DashboardGoodsCardTotals {
  card_trade_amount: NumericInput;
  card_user_pay_amount: NumericInput;
  card_gsv_pay_time: NumericInput;
  card_refund_amount_pay_time: NumericInput;
  card_refund_rate_pay_time: NumericInput;
  card_exposure_user_count: NumericInput;
  card_click_user_count: NumericInput;
  card_click_rate_user: NumericInput;
  card_buyer_count: NumericInput;
  card_click_to_pay_rate_user: NumericInput;
  card_order_count: NumericInput;
  card_cart_user_count: NumericInput;
  card_favorite_user_count: NumericInput;
  first_buy_user_count: NumericInput;
  rebuy_user_count: NumericInput;
  first_buy_new_rate: NumericInput;
  rebuy_old_rate: NumericInput;
  card_click_count: NumericInput;
  card_exposure_count: NumericInput;
  platform_support_exposure_count: NumericInput;
  card_avg_order_value: NumericInput;
  card_exposure_to_pay_rate_user: NumericInput;
}

export interface DashboardGoodsCardTrendRow {
  date: string;
  card_user_pay_amount: NumericInput;
  card_exposure_user_count: NumericInput;
}

export interface DashboardGoodsCardRow {
  id: NumericInput;
  shop_name: string;
  shop_id: string;
  date: string;
  product_title?: string | null;
  product_id: string;
  product_url?: string | null;
  card_exposure_user_count: NumericInput;
  card_click_user_count: NumericInput;
  card_click_rate_user: NumericInput;
  card_click_count: NumericInput;
  card_avg_click_per_user: NumericInput;
  new_customer_click_count: NumericInput;
  old_customer_click_count: NumericInput;
  new_customer_click_rate: NumericInput;
  old_customer_click_rate: NumericInput;
  card_user_pay_amount: NumericInput;
  card_buyer_count: NumericInput;
  card_avg_order_value: NumericInput;
  card_click_to_pay_rate_user: NumericInput;
  first_buy_user_count: NumericInput;
  rebuy_user_count: NumericInput;
  first_buy_new_rate: NumericInput;
  rebuy_old_rate: NumericInput;
  card_exposure_count: NumericInput;
  card_exposure_to_pay_rate_user: NumericInput;
  card_exposure_to_pay_rate_count: NumericInput;
  card_gpm: NumericInput;
  card_click_rate_count: NumericInput;
  card_click_to_pay_rate_count: NumericInput;
  card_cart_user_count: NumericInput;
  card_favorite_user_count: NumericInput;
  card_order_count: NumericInput;
  platform_support_exposure_count: NumericInput;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DashboardGoodsCardApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: 'douyin';
  asOfDate?: string | null;
  dataDateBounds?: DashboardLiveDataDateBounds | null;
  currentTotals: DashboardGoodsCardTotals;
  previousTotals: DashboardGoodsCardTotals;
  trend: DashboardGoodsCardTrendRow[];
  rows: DashboardGoodsCardRow[];
}

export interface DashboardGoodsCardTrafficMetrics {
  cardExposureUserCount: DashboardTrafficMetricTriplet;
  cardClickUserCount: DashboardTrafficMetricTriplet;
  cardClickRateUser: DashboardTrafficMetricTriplet;
  cardBuyerCount: DashboardTrafficMetricTriplet;
  cardClickToPayRateUser: DashboardTrafficMetricTriplet;
  cardExposureToPayRateUser: DashboardTrafficMetricTriplet;
  cardUserPayAmount: DashboardTrafficMetricTriplet;
  cardOrderCount: DashboardTrafficMetricTriplet;
  cardCartUserCount: DashboardTrafficMetricTriplet;
  cardFavoriteUserCount: DashboardTrafficMetricTriplet;
  cardBounceUserCount: DashboardTrafficMetricTriplet;
}

export interface DashboardGoodsCardTrafficTreeNode {
  key: string;
  sourceKey: string;
  parentSourceKey: string;
  sourceLevel: number;
  sourceName: string;
  parentSourceName: string;
  metrics: DashboardGoodsCardTrafficMetrics;
  children?: DashboardGoodsCardTrafficTreeNode[];
}

export interface DashboardGoodsCardTrafficApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: 'douyin';
  asOfDate?: string | null;
  productId: string;
  shopId?: string | null;
  productTitle?: string | null;
  tree: DashboardGoodsCardTrafficTreeNode[];
}

export type GoodsCardFieldFormat = 'text' | 'date' | 'datetime' | 'integer' | 'number' | 'rate' | 'currency' | 'link';

export type GoodsCardColumnDefinition = {
  key: keyof DashboardGoodsCardRow;
  title: string;
  format: GoodsCardFieldFormat;
  width: number;
  digits?: number;
};

export type GoodsCardTrafficMetricDefinition = {
  key: keyof DashboardGoodsCardTrafficMetrics;
  title: string;
  format: TrafficMetricFormat;
  digits?: number;
};
