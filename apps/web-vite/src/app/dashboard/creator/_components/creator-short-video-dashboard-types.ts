import type { CreatorDateBoundsPayload } from './creator-date-bounds';
import type { NumericInput } from './creator-formatters';

export interface CreatorShortVideoRosterTotals {
  influencer_count: NumericInput;
  with_id_count: NumericInput;
  without_id_count: NumericInput;
  cooperation_status_count: NumericInput;
}

export interface CreatorShortVideoOverviewTotals {
  matched_influencer_count: NumericInput;
  matched_coverage_rate: NumericInput;
  matched_shortvideo_influencer_count: NumericInput;
  matched_shortvideo_count: NumericInput;
  matched_shortvideo_buyer_count: NumericInput;
  matched_shortvideo_gmv: NumericInput;
  shortvideo_influencer_count: NumericInput;
  shortvideo_count: NumericInput;
  shortvideo_duration_minutes: NumericInput;
  shortvideo_view_count: NumericInput;
  shortvideo_exposure_user_count: NumericInput;
  shortvideo_product_click_user: NumericInput;
  shortvideo_order_count: NumericInput;
  shortvideo_refund_order_count: NumericInput;
  shortvideo_buyer_count: NumericInput;
  shortvideo_gmv: NumericInput;
  shortvideo_user_pay_amount: NumericInput;
  shortvideo_refund_amount: NumericInput;
  shortvideo_ad_cost: NumericInput;
  shortvideo_live_room_pay_amount: NumericInput;
  shortvideo_search_after_view_pay_amount: NumericInput;
  shortvideo_shop_page_pay_amount: NumericInput;
  watch_to_buyer_rate: NumericInput;
  gmv_per_session: NumericInput;
}

export interface CreatorShortVideoTrendContributor {
  platform: string | null;
  influencer_name: string | null;
  shortvideo_gmv: NumericInput;
  shortvideo_refund_amount: NumericInput;
  shortvideo_gsv: NumericInput;
}

export interface CreatorShortVideoOverviewSeriesRow {
  date: string;
  shortvideo_count: NumericInput;
  shortvideo_duration_minutes: NumericInput;
  shortvideo_view_count: NumericInput;
  shortvideo_exposure_user_count: NumericInput;
  shortvideo_product_click_user: NumericInput;
  shortvideo_order_count: NumericInput;
  shortvideo_refund_order_count: NumericInput;
  shortvideo_buyer_count: NumericInput;
  shortvideo_gmv: NumericInput;
  shortvideo_user_pay_amount: NumericInput;
  shortvideo_refund_amount: NumericInput;
  shortvideo_ad_cost: NumericInput;
  shortvideo_live_room_pay_amount: NumericInput;
  shortvideo_search_after_view_pay_amount: NumericInput;
  shortvideo_shop_page_pay_amount: NumericInput;
  watch_to_buyer_rate: NumericInput;
  contributors?: CreatorShortVideoTrendContributor[];
  contributor_count?: NumericInput;
}

export interface CreatorShortVideoPlatformShareItem {
  platform: string;
  shortvideo_influencer_count: NumericInput;
  shortvideo_gmv: NumericInput;
  shortvideo_count: NumericInput;
  shortvideo_buyer_count: NumericInput;
}

export interface CreatorShortVideoCooperationSummaryItem {
  cooperation_status: string;
  influencer_count: NumericInput;
  with_id_count: NumericInput;
  matched_influencer_count: NumericInput;
  shortvideo_influencer_count: NumericInput;
  shortvideo_count: NumericInput;
  shortvideo_buyer_count: NumericInput;
  shortvideo_gmv: NumericInput;
}

export interface CreatorShortVideoOverviewApiResponse {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  dataDateBounds?: CreatorDateBoundsPayload | null;
  rosterTotals: CreatorShortVideoRosterTotals;
  currentTotals: CreatorShortVideoOverviewTotals;
  previousTotals: CreatorShortVideoOverviewTotals;
  currentSeries: CreatorShortVideoOverviewSeriesRow[];
  previousSeries: CreatorShortVideoOverviewSeriesRow[];
  platformCurrent: CreatorShortVideoPlatformShareItem[];
  cooperationStatusCurrent: CreatorShortVideoCooperationSummaryItem[];
}

export interface CreatorShortVideoDetailsSummary {
  influencer_count: NumericInput;
  with_id_count: NumericInput;
  without_id_count: NumericInput;
  matched_influencer_count: NumericInput;
  shortvideo_influencer_count: NumericInput;
  shortvideo_count: NumericInput;
  shortvideo_duration_minutes: NumericInput;
  shortvideo_view_count: NumericInput;
  shortvideo_exposure_user_count: NumericInput;
  shortvideo_product_click_user: NumericInput;
  shortvideo_order_count: NumericInput;
  shortvideo_refund_order_count: NumericInput;
  shortvideo_buyer_count: NumericInput;
  shortvideo_gmv: NumericInput;
  shortvideo_user_pay_amount: NumericInput;
  shortvideo_refund_amount: NumericInput;
  shortvideo_ad_cost: NumericInput;
  shortvideo_live_room_pay_amount: NumericInput;
  shortvideo_search_after_view_pay_amount: NumericInput;
  shortvideo_shop_page_pay_amount: NumericInput;
  matched_coverage_rate: NumericInput;
  watch_to_buyer_rate: NumericInput;
}

export type CreatorShortVideoDetailGrain =
  | 'trade_video_day'
  | 'qianchuan_video_day'
  | 'qianchuan_material_day'
  | string;

export type CreatorShortVideoArrayInput = string | readonly unknown[] | null | undefined;

export type CreatorShortVideoAssetArrayFieldKey =
  | 'asset_product_names'
  | 'asset_owner_names'
  | 'asset_owner_user_ids'
  | 'asset_video_types'
  | 'asset_content_scenes'
  | 'asset_content_scene_groups'
  | 'asset_content_scene_subtypes';

type CreatorShortVideoNormalizedAssetArrays = {
  [Key in CreatorShortVideoAssetArrayFieldKey]: string[];
};

type CreatorShortVideoNormalizedManualPermissions = {
  manual_can_edit: boolean;
  manual_can_delete: boolean;
};

export interface CreatorShortVideoDetailApiRow {
  id: number;
  sequence_no: NumericInput;
  detail_grain: CreatorShortVideoDetailGrain;
  stat_date: string;
  platform: string | null;

  shop_name: string | null;
  shop_id: string | null;
  account_type: string | null;
  account_types: string[];
  video_title: string | null;
  video_id: string | null;
  is_promoted: string | null;
  play_url: string | null;
  publish_time: string | null;
  author_nickname: string | null;
  author_douyin_id: string | null;
  author_name_snapshot?: string | null;
  product_id: string | null;
  trade_source_ids: number[];
  video_view_count: NumericInput;
  user_pay_amount: NumericInput;
  refund_amount: NumericInput;
  live_room_pay_amount: NumericInput;
  search_after_view_pay_amount: NumericInput;
  shop_page_pay_amount: NumericInput;
  trade_created_at: string | null;
  trade_updated_at: string | null;

  asset_ids: string[];
  platform_video_ids: string[];
  ad_material_ids: string[];
  asset_product_names?: CreatorShortVideoArrayInput;
  asset_owner_names?: CreatorShortVideoArrayInput;
  asset_owner_user_ids?: CreatorShortVideoArrayInput;
  asset_video_types?: CreatorShortVideoArrayInput;
  asset_content_scenes?: CreatorShortVideoArrayInput;
  asset_content_scene_groups?: CreatorShortVideoArrayInput;
  asset_content_scene_subtypes?: CreatorShortVideoArrayInput;
  qianchuan_material_ids: string[];
  qianchuan_material_key: string | null;
  qianchuan_material_count: NumericInput;
  qianchuan_material_video_names: string[];
  qianchuan_material_created_at_min: string | null;
  qianchuan_material_created_at_max: string | null;
  qianchuan_overall_impression_count: NumericInput;
  qianchuan_overall_click_count: NumericInput;
  qianchuan_overall_click_rate: NumericInput;
  qianchuan_overall_conversion_rate: NumericInput;
  qianchuan_overall_cost: NumericInput;
  qianchuan_overall_order_count: NumericInput;
  qianchuan_overall_gmv: NumericInput;
  qianchuan_overall_pay_roi: NumericInput;
  qianchuan_overall_order_cost: NumericInput;
  qianchuan_user_pay_amount: NumericInput;
  qianchuan_overall_cpm: NumericInput;
  qianchuan_overall_cpc: NumericInput;
  qianchuan_smart_coupon_amount: NumericInput;
  qianchuan_platform_subsidy_amount: NumericInput;
  qianchuan_net_gmv_roi: NumericInput;
  qianchuan_net_gmv: NumericInput;
  qianchuan_net_order_count: NumericInput;
  qianchuan_net_order_cost: NumericInput;
  qianchuan_net_gmv_settlement_rate: NumericInput;
  qianchuan_refund_rate_1h: NumericInput;
  qianchuan_source_file_names: string[];
  qianchuan_source_ids: string[];
  qianchuan_ingest_time: string | null;
  qianchuan_metric_attributed: boolean;
  qianchuan_attribution_rank: NumericInput;

  mapping_status: string;
  qianchuan_match_status: string;
  trade_source_updated_at: string | null;
  qianchuan_source_updated_at: string | null;
  source_max_updated_at: string | null;
  created_at: string | null;
  updated_at: string | null;

  influencer_key?: string | null;
  influencer_name: string;
  influencer_id: string | null;
  influencer_nickname: string | null;
  anchor_desc: string | null;
  anchor_level: string | null;
  main_platform_fans: string | null;
  sales_30d: string | null;
  sales_90d: string | null;
  cooperation_status: string | null;
  cooperation_status_norm: string;
  cooperation_desc: string | null;
  owner_name: string | null;
  source_file_name: string;
  source_etl_loaded_at: string | null;
  shortvideo_count: NumericInput;
  shortvideo_duration_minutes: NumericInput;
  shortvideo_view_count: NumericInput;
  shortvideo_exposure_user_count: NumericInput;
  shortvideo_product_click_user: NumericInput;
  shortvideo_order_count: NumericInput;
  shortvideo_refund_order_count: NumericInput;
  shortvideo_buyer_count: NumericInput;
  shortvideo_gmv: NumericInput;
  shortvideo_user_pay_amount: NumericInput;
  shortvideo_refund_amount: NumericInput;
  shortvideo_ad_cost: NumericInput;
  shortvideo_live_room_pay_amount: NumericInput;
  shortvideo_search_after_view_pay_amount: NumericInput;
  shortvideo_shop_page_pay_amount: NumericInput;
  watch_to_buyer_rate: NumericInput;
  refund_rate: NumericInput;
  match_status: 'matched_by_id' | 'matched_by_name' | 'unmatched' | 'missing_influencer_id' | string;
  is_matched: boolean;
  has_shortvideo_data: boolean;
  manual_attr_id: NumericInput;
  manual_scope_type: 'creator' | 'video' | string | null;
  manual_platform: string | null;
  manual_author_douyin_id: string | null;
  manual_author_name_snapshot: string | null;
  manual_video_id: string | null;
  manual_product_id: string | null;
  manual_fans_count: number | null;
  manual_fans_count_updated_at: string | null;
  manual_creator_type: string | null;
  manual_mcn: string | null;
  manual_creator_fee_amount: number | null;
  manual_creator_fee_type: string | null;
  manual_creator_fee_note: string | null;
  manual_created_by_user_id: string | null;
  manual_created_by_name: string | null;
  manual_updated_by_user_id: string | null;
  manual_updated_by_name: string | null;
  manual_created_at: string | null;
  manual_updated_at: string | null;
  manual_is_deleted: boolean | null;
  manual_can_edit?: unknown;
  manual_can_delete?: unknown;
}

export interface CreatorShortVideoDetailRow
  extends Omit<CreatorShortVideoDetailApiRow, CreatorShortVideoAssetArrayFieldKey | 'manual_can_edit' | 'manual_can_delete'>,
    CreatorShortVideoNormalizedAssetArrays,
    CreatorShortVideoNormalizedManualPermissions {}

export interface CreatorShortVideoDetailsApiResponse {
  startDate: string;
  endDate: string;
  cooperationStatus: string | null;
  keyword: string | null;
  summary: CreatorShortVideoDetailsSummary;
  statusSummary: CreatorShortVideoCooperationSummaryItem[];
  rows: CreatorShortVideoDetailApiRow[];
}

export interface CreatorShortVideoManualAttrsPayload {
  authorDouyinId: string;
  authorNameSnapshot?: string | null;
  videoId?: string | null;
  productId?: string | null;
  fansCount?: number | null;
  creatorType?: string | null;
  mcn?: string | null;
  creatorFeeAmount?: number | null;
  creatorFeeType?: string | null;
  creatorFeeNote?: string | null;
}

export interface CreatorShortVideoManualAttrsResponse {
  ok: true;
}

export interface CreatorShortVideoManualAttrsDeleteResponse {
  ok: true;
  deleted: boolean;
}
