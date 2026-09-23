export interface PlatformTrendPoint {
  date: string;
  value: unknown;
}

export interface PlatformTrendItem {
  metric: unknown;
  points?: PlatformTrendPoint[];
}

export interface PlatformChartSeries {
  name: string;
  data: number[];
}

export interface PlatformTrendChartData {
  series: PlatformChartSeries[];
  xAxis: string[];
}

export interface PlatformMetricCard {
  key: string;
  label: string;
  value: string;
  wow: number | undefined;
}

export type PlatformMetricsSource = {
  gmv?: unknown;
  prev_gmv?: unknown;
  gsv?: unknown;
  refund_amount_refund_time?: unknown;
  prev_refund_amount_refund_time?: unknown;
  refund_amount_pay_time?: unknown;
  prev_refund_amount_pay_time?: unknown;
  orders?: unknown;
  prev_orders?: unknown;
  buyer_count?: unknown;
  prev_buyer_count?: unknown;
  uv?: unknown;
  arpu?: unknown;
  prev_arpu?: unknown;
};

export interface PlatformBaseMetricValues {
  gmv: number;
  prevGmv: number | undefined;
  prevGmvSafe: number;
  gmvDelta: number;
  gsv: number | undefined;
  refundAmount: number | undefined;
  prevRefundAmount: number | undefined;
  refundAmountPayTime: number | undefined;
  prevRefundAmountPayTime: number | undefined;
  prevGsv: number | undefined;
  orders: number;
  prevOrders: number | undefined;
  buyerCount: number | undefined;
  prevBuyerCount: number | undefined;
  arpu: number | undefined;
  prevArpu: number | undefined;
}
