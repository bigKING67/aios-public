import type { NumericInput } from './dashboard-formatters';

export type LiveScope = 'all' | 'self' | 'influencer';

export interface DashboardLiveDataDateBounds {
  minDate: string | null;
  maxDate: string | null;
}

export interface DashboardLiveTotals {
  live_session_count: NumericInput;
  live_gmv: NumericInput;
  live_buyer_count: NumericInput;
  live_watch_user_count: NumericInput;
  live_order_count: NumericInput;
  live_refund_order_count: NumericInput;
  live_refund_amount: NumericInput;
  refund_rate: NumericInput;
  anchor_count: NumericInput;
}

export interface DashboardLiveTrendRow {
  date: string;
  live_gmv: NumericInput;
  live_gsv: NumericInput;
  gpm: NumericInput;
}

export interface DashboardLiveDetailRow {
  stat_date?: string;
  live_title?: string | null;
  live_room_title?: string | null;
  anchor_douyin_id: string;
  anchor_nickname: string;
  anchor_type: string;
  shop_name: string;
  shop_id: string;
  live_start_time: string;
  live_end_time?: string | null;
  live_session_count: NumericInput;
  live_duration_minutes: NumericInput;
  live_exposure_user_count: NumericInput;
  live_exposure_count: NumericInput;
  live_user_pay_amount: NumericInput;
  hourly_user_pay_amount: NumericInput;
  live_sale_quantity: NumericInput;
  hourly_watch_user_count: NumericInput;
  live_watch_count: NumericInput;
  max_online_count: NumericInput;
  avg_online_count: NumericInput;
  avg_watch_duration_minutes: NumericInput;
  comment_count: NumericInput;
  new_live_group_count: NumericInput;
  new_follower_count: NumericInput;
  unfollow_count: NumericInput;
  old_follower_watch_rate: NumericInput;
  product_count: NumericInput;
  live_product_exposure_user: NumericInput;
  live_product_click_user: NumericInput;
  live_product_exposure_count: NumericInput;
  live_product_click_count: NumericInput;
  live_gmv: NumericInput;
  live_buyer_count: NumericInput;
  live_watch_user_count: NumericInput;
  live_order_count: NumericInput;
  live_refund_order_count: NumericInput;
  live_refund_amount: NumericInput;
  live_refund_user_count: NumericInput;
  estimated_commission: NumericInput;
  product_click_rate_count: NumericInput;
  product_click_rate_user: NumericInput;
  click_to_pay_rate_count: NumericInput;
  click_to_pay_rate_user: NumericInput;
  watch_to_pay_rate_count: NumericInput;
  watch_to_pay_rate_user: NumericInput;
  presale_order_count: NumericInput;
  presale_full_amount: NumericInput;
  new_cart_group_count: NumericInput;
  live_ad_cost: NumericInput;
  net_gmv: NumericInput;
  net_order_count: NumericInput;
  refund_amount_1h: NumericInput;
  refund_order_count_1h: NumericInput;
  refund_rate_1h: NumericInput;
  coupon_guided_payment_amount: NumericInput;
  coupon_guided_payment_rate: NumericInput;
  coupon_subsidy_amount: NumericInput;
  coupon_usage_count: NumericInput;
  ad_cost_shop_bound: NumericInput;
  ad_cost_shop_targeted: NumericInput;
  refund_rate: NumericInput;
}

export interface DashboardLiveGoodsRow {
  key: string;
  rowType: 'product_summary' | 'sku';
  stat_date?: string;
  live_start_time: string;
  live_end_time?: string | null;
  anchor_douyin_id: string;
  anchor_nickname: string;
  anchor_type: string;
  shop_id: string;
  shop_name: string;
  live_identity_type: string;
  live_duration_minutes: NumericInput;
  product_name: string;
  product_id: string;
  sku_name: string;
  product_image_url?: string | null;
  product_user_pay_amount: NumericInput;
  product_sales_volume: NumericInput;
  product_buyer_count: NumericInput;
  product_order_count: NumericInput;
  presale_order_count: NumericInput;
  presale_full_amount: NumericInput;
  product_exposure_user_count: NumericInput;
  product_click_user_count: NumericInput;
  product_exposure_to_click_rate_user: NumericInput;
  product_click_to_pay_rate_user: NumericInput;
  refund_user_count: NumericInput;
  refund_amount: NumericInput;
  refund_order_count: NumericInput;
  children?: DashboardLiveGoodsRow[];
}

export interface DashboardLiveGoodsApiResponse {
  startDate: string;
  endDate: string;
  platform: 'douyin';
  scope: LiveScope;
  asOfDate?: string | null;
  tree: DashboardLiveGoodsRow[];
}

export interface DashboardLiveGoodsDetailExportRow {
  stat_date?: string | null;
  live_start_time?: string | null;
  live_end_time?: string | null;
  anchor_douyin_id?: string | null;
  anchor_nickname?: string | null;
  anchor_type?: string | null;
  shop_id?: string | null;
  shop_name?: string | null;
  live_identity_type?: string | null;
  live_duration_minutes?: NumericInput;
  product_name?: string | null;
  product_id?: string | null;
  sku_name?: string | null;
  sku_row_type?: string | null;
  product_image_url?: string | null;
  product_user_pay_amount?: NumericInput;
  product_sales_volume?: NumericInput;
  product_buyer_count?: NumericInput;
  product_order_count?: NumericInput;
  presale_order_count?: NumericInput;
  presale_full_amount?: NumericInput;
  product_exposure_user_count?: NumericInput;
  product_click_user_count?: NumericInput;
  product_exposure_to_click_rate_user?: NumericInput;
  product_click_to_pay_rate_user?: NumericInput;
  refund_user_count?: NumericInput;
  refund_amount?: NumericInput;
  refund_order_count?: NumericInput;
  source_updated_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  influencer_avatar_url?: string | null;
  influencer_nickname?: string | null;
  influencer_level?: NumericInput;
  influencer_douyin_id?: string | null;
  influencer_type?: string | null;
  influencer_org?: string | null;
  follower_count_before_live?: NumericInput;
  live_time_range_text?: string | null;
  live_duration_text?: string | null;
  live_platform?: string | null;
  live_user_pay_amount?: NumericInput;
  pay_per_thousand_views?: NumericInput;
  estimated_commission_cost?: NumericInput;
  penalty_count?: NumericInput;
  source_file_name?: string | null;
  source_file_mtime?: string | null;
  ingest_time?: string | null;
}

export interface DashboardLiveGoodsDetailExportApiResponse {
  startDate?: string;
  endDate?: string;
  platform?: 'douyin';
  scope?: LiveScope;
  rows: DashboardLiveGoodsDetailExportRow[];
}

export interface DashboardLiveGoodsSessionGroup {
  key: string;
  liveStartTime: string;
  liveEndTime?: string | null;
  anchorDouyinId: string;
  anchorNickname: string;
  anchorType: string;
  shopName: string;
  productRows: DashboardLiveGoodsRow[];
  productCount: number;
  skuCount: number;
  totalPayAmount: number;
  totalSalesVolume: number;
  totalBuyerCount: number;
  totalOrderCount: number;
  totalRefundAmount: number;
  totalRefundOrderCount: number;
  maxProductPayAmount: number;
}

export interface DashboardLiveSectionPayload {
  currentTotals: DashboardLiveTotals;
  previousTotals: DashboardLiveTotals;
  trend: DashboardLiveTrendRow[];
  rows: DashboardLiveDetailRow[];
}

export interface DashboardLiveOverviewPayload {
  currentTotals: DashboardLiveTotals;
  previousTotals: DashboardLiveTotals;
  trend: DashboardLiveTrendRow[];
}

export interface DashboardLiveApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: 'douyin';
  asOfDate?: string | null;
  dataDateBounds?: DashboardLiveDataDateBounds | null;
  overview: DashboardLiveOverviewPayload;
  selfLive: DashboardLiveSectionPayload;
  influencerLive: DashboardLiveSectionPayload;
}
