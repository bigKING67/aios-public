import type { NumericInput } from './dashboard-formatters';

export type DashboardQianchuanMetricValue = NumericInput;
export type DashboardQianchuanMaterialType = 'live_room_screen' | 'live_video';
export type QianchuanMaterialType = DashboardQianchuanMaterialType;
export type DashboardQianchuanMaterialScopeKey = 'all' | 'video' | 'liveRoomScreen';
export type DashboardQianchuanMaterialScopeResponseKey =
  | DashboardQianchuanMaterialScopeKey
  | 'liveVideo'
  | 'live_video'
  | 'live_room_screen';

export interface DashboardQianchuanDateBounds {
  minDate?: string | null;
  maxDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface DashboardQianchuanMaterialTypeFields {
  materialType?: DashboardQianchuanMaterialType | string | null;
  material_type?: DashboardQianchuanMaterialType | string | null;
}

type DashboardQianchuanMetricKey =
  | 'materialCount'
  | 'material_count'
  | 'overallCost'
  | 'overall_cost'
  | 'costAmount'
  | 'cost_amount'
  | 'overallGmv'
  | 'overall_gmv'
  | 'userPayAmount'
  | 'user_pay_amount'
  | 'overallOrderCount'
  | 'overall_order_count'
  | 'orderCount'
  | 'order_count'
  | 'overallPayRoi'
  | 'overall_pay_roi'
  | 'payRoi'
  | 'pay_roi'
  | 'netGmv'
  | 'net_gmv'
  | 'netGmvRoi'
  | 'net_gmv_roi'
  | 'netOrderCount'
  | 'net_order_count'
  | 'netOrderCost'
  | 'net_order_cost'
  | 'refundRate1h'
  | 'refund_rate_1h'
  | 'settlementRoi7d'
  | 'settlement_roi_7d'
  | 'settlementRoi14d'
  | 'settlement_roi_14d'
  | 'settlementRoi30d'
  | 'settlement_roi_30d'
  | 'overallImpressionCount'
  | 'overall_impression_count'
  | 'impressionCount'
  | 'impression_count'
  | 'overallClickCount'
  | 'overall_click_count'
  | 'clickCount'
  | 'click_count'
  | 'overallClickRate'
  | 'overall_click_rate'
  | 'clickRate'
  | 'click_rate'
  | 'overallConversionRate'
  | 'overall_conversion_rate'
  | 'conversionRate'
  | 'conversion_rate'
  | 'overallCpm'
  | 'overall_cpm'
  | 'overallCpc'
  | 'overall_cpc'
  | 'overallCostRatio'
  | 'overall_cost_ratio'
  | 'overallCostShare'
  | 'overall_cost_share'
  | 'overallGmvShare'
  | 'overall_gmv_share'
  | 'smartCouponAmount'
  | 'smart_coupon_amount'
  | 'platformSubsidyAmount'
  | 'platform_subsidy_amount'
  | 'playCount'
  | 'play_count'
  | 'play3sCount'
  | 'play_3s_count'
  | 'playFinishCount'
  | 'play_finish_count'
  | 'videoPlayCount'
  | 'video_play_count'
  | 'videoCompletePlayCount'
  | 'video_complete_play_count'
  | 'videoCompletePlayRate'
  | 'video_complete_play_rate'
  | 'videoLikeCount'
  | 'video_like_count'
  | 'videoCommentCount'
  | 'video_comment_count'
  | 'liveCommentCount'
  | 'live_comment_count'
  | 'liveLikeCount'
  | 'live_like_count'
  | 'newFansCount'
  | 'new_fans_count'
  | 'liveRoomEnterCount'
  | 'live_room_enter_count';

export type DashboardQianchuanMetricTotals = Partial<
  Record<DashboardQianchuanMetricKey, DashboardQianchuanMetricValue>
>;

export type DashboardQianchuanTotals = DashboardQianchuanMetricTotals;

export interface DashboardQianchuanTrendRow extends DashboardQianchuanMetricTotals {
  date?: string | null;
  statDate?: string | null;
  stat_date?: string | null;
}

export interface DashboardQianchuanCommonRow
  extends DashboardQianchuanMaterialTypeFields,
    DashboardQianchuanMetricTotals {
  statDate?: string | null;
  stat_date?: string | null;
  promotionType?: string | null;
  promotion_type?: string | null;
  douyinAccountDisplayId?: string | null;
  douyin_account_display_id?: string | null;
  douyinAccountName?: string | null;
  douyin_account_name?: string | null;
  accountName?: string | null;
  account_name?: string | null;
  materialKey?: string | null;
  material_key?: string | null;
  materialId?: string | null;
  material_id?: string | null;
  materialName?: string | null;
  material_name?: string | null;
  sourceUpdatedAt?: string | null;
  source_updated_at?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
}

export type DashboardQianchuanCommonMaterialRow = DashboardQianchuanCommonRow;

export interface DashboardQianchuanMaterialTypeMixRow
  extends DashboardQianchuanMaterialTypeFields,
    DashboardQianchuanMetricTotals {
  materialType?: DashboardQianchuanMaterialType | string | null;
  material_type?: DashboardQianchuanMaterialType | string | null;
  materialTypeLabel?: string | null;
  material_type_label?: string | null;
  overallCostShare?: DashboardQianchuanMetricValue;
  overall_cost_share?: DashboardQianchuanMetricValue;
  overallGmvShare?: DashboardQianchuanMetricValue;
  overall_gmv_share?: DashboardQianchuanMetricValue;
  costShare?: DashboardQianchuanMetricValue;
  cost_share?: DashboardQianchuanMetricValue;
  gmvShare?: DashboardQianchuanMetricValue;
  gmv_share?: DashboardQianchuanMetricValue;
}

export interface DashboardQianchuanLiveRoomScreenRow extends DashboardQianchuanCommonRow {
  materialType?: 'live_room_screen' | null;
  material_type?: 'live_room_screen' | null;
  liveCommentCount?: DashboardQianchuanMetricValue;
  live_comment_count?: DashboardQianchuanMetricValue;
  liveLikeCount?: DashboardQianchuanMetricValue;
  live_like_count?: DashboardQianchuanMetricValue;
  newFansCount?: DashboardQianchuanMetricValue;
  new_fans_count?: DashboardQianchuanMetricValue;
}

export interface DashboardQianchuanLiveVideoRow extends DashboardQianchuanCommonRow {
  materialType?: 'live_video' | null;
  material_type?: 'live_video' | null;
  videoId?: string | null;
  video_id?: string | null;
  videoName?: string | null;
  video_name?: string | null;
  videoTitle?: string | null;
  video_title?: string | null;
  materialVideoName?: string | null;
  material_video_name?: string | null;
  assetId?: string | null;
  asset_id?: string | null;
  contentAssetId?: string | null;
  content_asset_id?: string | null;
  globalMaterialVideoType?: string | null;
  global_material_video_type?: string | null;
  materialCreatedAt?: string | null;
  material_created_at?: string | null;
  liveRoomName?: string | null;
  live_room_name?: string | null;
  videoPlayCount?: DashboardQianchuanMetricValue;
  video_play_count?: DashboardQianchuanMetricValue;
  playCount?: DashboardQianchuanMetricValue;
  play_count?: DashboardQianchuanMetricValue;
  play3sCount?: DashboardQianchuanMetricValue;
  play_3s_count?: DashboardQianchuanMetricValue;
  playFinishCount?: DashboardQianchuanMetricValue;
  play_finish_count?: DashboardQianchuanMetricValue;
  liveRoomEnterCount?: DashboardQianchuanMetricValue;
  live_room_enter_count?: DashboardQianchuanMetricValue;
  videoCompletePlayRate?: DashboardQianchuanMetricValue;
  video_complete_play_rate?: DashboardQianchuanMetricValue;
  playRate2s?: DashboardQianchuanMetricValue;
  play_rate_2s?: DashboardQianchuanMetricValue;
  playRate3s?: DashboardQianchuanMetricValue;
  play_rate_3s?: DashboardQianchuanMetricValue;
  playRate5s?: DashboardQianchuanMetricValue;
  play_rate_5s?: DashboardQianchuanMetricValue;
  playRate10s?: DashboardQianchuanMetricValue;
  play_rate_10s?: DashboardQianchuanMetricValue;
  videoLikeCount?: DashboardQianchuanMetricValue;
  video_like_count?: DashboardQianchuanMetricValue;
  videoCommentCount?: DashboardQianchuanMetricValue;
  video_comment_count?: DashboardQianchuanMetricValue;
  avgWatchDuration?: DashboardQianchuanMetricValue;
  avg_watch_duration?: DashboardQianchuanMetricValue;
  newFansCount?: DashboardQianchuanMetricValue;
  new_fans_count?: DashboardQianchuanMetricValue;
}

export interface DashboardQianchuanOverviewPayload {
  currentTotals?: DashboardQianchuanMetricTotals | null;
  current_totals?: DashboardQianchuanMetricTotals | null;
  previousTotals?: DashboardQianchuanMetricTotals | null;
  previous_totals?: DashboardQianchuanMetricTotals | null;
  trend?: DashboardQianchuanTrendRow[] | null;
}

export interface DashboardQianchuanMaterialScopeSummary {
  key?: DashboardQianchuanMaterialScopeKey | string | null;
  label?: string | null;
  materialType?: DashboardQianchuanMaterialType | string | null;
  material_type?: DashboardQianchuanMaterialType | string | null;
  currentTotals?: DashboardQianchuanMetricTotals | null;
  current_totals?: DashboardQianchuanMetricTotals | null;
  previousTotals?: DashboardQianchuanMetricTotals | null;
  previous_totals?: DashboardQianchuanMetricTotals | null;
  trend?: DashboardQianchuanTrendRow[] | null;
  detailRowCount?: number | null;
  detail_row_count?: number | null;
}

export type DashboardQianchuanMaterialScopes = Partial<
  Record<DashboardQianchuanMaterialScopeResponseKey, DashboardQianchuanMaterialScopeSummary>
>;

export interface DashboardQianchuanApiResponse {
  startDate?: string | null;
  endDate?: string | null;
  prevStartDate?: string | null;
  prevEndDate?: string | null;
  platform?: 'douyin' | string | null;
  asOfDate?: string | null;
  dataDateBounds?: DashboardQianchuanDateBounds | null;
  overview?: DashboardQianchuanOverviewPayload | null;
  materialScopes?: DashboardQianchuanMaterialScopes | null;
  material_scopes?: DashboardQianchuanMaterialScopes | null;
  materialTypeMix?: DashboardQianchuanMaterialTypeMixRow[] | null;
  material_type_mix?: DashboardQianchuanMaterialTypeMixRow[] | null;
  liveRoomScreen?: {
    rows?: DashboardQianchuanLiveRoomScreenRow[] | null;
  } | null;
  live_room_screen?: {
    rows?: DashboardQianchuanLiveRoomScreenRow[] | null;
  } | null;
  liveVideo?: {
    rows?: DashboardQianchuanLiveVideoRow[] | null;
  } | null;
  live_video?: {
    rows?: DashboardQianchuanLiveVideoRow[] | null;
  } | null;
}
