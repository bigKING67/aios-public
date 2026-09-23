import type { CreatorDateBoundsPayload } from './creator-date-bounds';
import type { NumericInput } from './creator-formatters';

export interface CreatorLiveRosterTotals {
  influencer_count: NumericInput;
  with_id_count: NumericInput;
  without_id_count: NumericInput;
  cooperation_status_count: NumericInput;
}

export interface CreatorLiveOverviewTotals {
  matched_influencer_count: NumericInput;
  matched_coverage_rate: NumericInput;
  matched_live_influencer_count: NumericInput;
  matched_live_session_count: NumericInput;
  matched_live_buyer_count: NumericInput;
  matched_live_gmv: NumericInput;
  live_influencer_count: NumericInput;
  live_session_count: NumericInput;
  live_duration_minutes: NumericInput;
  live_watch_user_count: NumericInput;
  live_exposure_user_count: NumericInput;
  live_product_click_user: NumericInput;
  live_order_count: NumericInput;
  live_refund_order_count: NumericInput;
  live_buyer_count: NumericInput;
  live_gmv: NumericInput;
  live_user_pay_amount: NumericInput;
  live_refund_amount: NumericInput;
  live_ad_cost: NumericInput;
  watch_to_buyer_rate: NumericInput;
  gmv_per_session: NumericInput;
}

export interface CreatorLiveTrendContributor {
  platform: string | null;
  influencer_name: string | null;
  live_gmv: NumericInput;
  live_gsv: NumericInput;
}

export interface CreatorLiveOverviewSeriesRow {
  date: string;
  live_session_count: NumericInput;
  live_duration_minutes: NumericInput;
  live_watch_user_count: NumericInput;
  live_exposure_user_count: NumericInput;
  live_product_click_user: NumericInput;
  live_order_count: NumericInput;
  live_refund_order_count: NumericInput;
  live_buyer_count: NumericInput;
  live_gmv: NumericInput;
  live_user_pay_amount: NumericInput;
  live_refund_amount: NumericInput;
  live_ad_cost: NumericInput;
  watch_to_buyer_rate: NumericInput;
  contributors?: CreatorLiveTrendContributor[];
  contributor_count?: NumericInput;
}

export interface CreatorLivePlatformShareItem {
  platform: string;
  live_influencer_count: NumericInput;
  live_gmv: NumericInput;
  live_session_count: NumericInput;
  live_buyer_count: NumericInput;
}

export interface CreatorLiveCooperationSummaryItem {
  cooperation_status: string;
  influencer_count: NumericInput;
  with_id_count: NumericInput;
  matched_influencer_count: NumericInput;
  live_influencer_count: NumericInput;
  live_session_count: NumericInput;
  live_buyer_count: NumericInput;
  live_gmv: NumericInput;
}

export interface CreatorLiveOverviewApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  dataDateBounds?: CreatorDateBoundsPayload | null;
  rosterTotals: CreatorLiveRosterTotals;
  currentTotals: CreatorLiveOverviewTotals;
  previousTotals: CreatorLiveOverviewTotals;
  currentSeries: CreatorLiveOverviewSeriesRow[];
  previousSeries: CreatorLiveOverviewSeriesRow[];
  platformCurrent: CreatorLivePlatformShareItem[];
  cooperationStatusCurrent: CreatorLiveCooperationSummaryItem[];
}

export interface CreatorLiveDetailsSummary {
  influencer_count: NumericInput;
  with_id_count: NumericInput;
  without_id_count: NumericInput;
  matched_influencer_count: NumericInput;
  live_influencer_count: NumericInput;
  live_session_count: NumericInput;
  live_duration_minutes: NumericInput;
  live_watch_user_count: NumericInput;
  live_exposure_user_count: NumericInput;
  live_product_click_user: NumericInput;
  live_order_count: NumericInput;
  live_refund_order_count: NumericInput;
  live_buyer_count: NumericInput;
  live_gmv: NumericInput;
  live_user_pay_amount: NumericInput;
  live_refund_amount: NumericInput;
  live_ad_cost: NumericInput;
  matched_coverage_rate: NumericInput;
  watch_to_buyer_rate: NumericInput;
}

export interface CreatorLiveDetailRow {
  id: number;
  sequence_no: NumericInput;
  influencer_name: string;
  influencer_id: string | null;
  anchor_desc: string | null;
  anchor_level: string | null;
  platform: string | null;
  main_platform_fans: string | null;
  sales_30d: string | null;
  sales_90d: string | null;
  cooperation_status: string | null;
  cooperation_status_norm: string;
  cooperation_desc: string | null;
  owner_name: string | null;
  source_file_name: string;
  source_etl_loaded_at: string | null;
  influencer_nickname: string | null;
  shop_id: string | null;
  shop_name: string | null;
  live_session_count: NumericInput;
  live_duration_minutes: NumericInput;
  live_watch_user_count: NumericInput;
  live_exposure_user_count: NumericInput;
  live_product_click_user: NumericInput;
  live_order_count: NumericInput;
  live_refund_order_count: NumericInput;
  live_buyer_count: NumericInput;
  live_gmv: NumericInput;
  live_user_pay_amount: NumericInput;
  live_refund_amount: NumericInput;
  live_ad_cost: NumericInput;
  watch_to_buyer_rate: NumericInput;
  refund_rate: NumericInput;
  match_status: 'matched' | 'unmatched' | 'missing_influencer_id' | string;
  is_matched: boolean;
  has_live_data: boolean;
}

export interface CreatorLiveDetailsApiResponse {
  startDate: string;
  endDate: string;
  cooperationStatus: string | null;
  keyword: string | null;
  summary: CreatorLiveDetailsSummary;
  statusSummary: CreatorLiveCooperationSummaryItem[];
  rows: CreatorLiveDetailRow[];
}
