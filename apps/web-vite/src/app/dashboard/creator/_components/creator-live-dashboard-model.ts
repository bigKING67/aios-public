import {
  buildCreatorCooperationStageLabelOrder,
  buildCreatorCooperationStageOrder,
} from './creator-cooperation-normalizers';
import type { CreatorDashboardTrendShareChartConfig } from './creator-dashboard-trend-share-chart-state';
import type { CreatorDashboardCooperationStageStateConfig } from './creator-dashboard-cooperation-stage-state';
import type { CreatorDashboardTableStateConfig } from './creator-dashboard-table-state';
import {
  CREATOR_COOPERATION_PLATFORM_PRIORITY_ORDER as COOPERATION_PLATFORM_PRIORITY_ORDER,
  formatCreatorCooperationStatusDisplay as formatCooperationStatusDisplay,
  normalizeCreatorCooperationPlatform as normalizeCooperationPlatform,
  normalizeCreatorCooperationStageKey as normalizeBaseCooperationStageKey,
  type CreatorCooperationStageKey as CooperationStageKey,
} from './creator-cooperation-normalizers';
import type {
  CreatorLiveDetailRow,
  CreatorLiveOverviewSeriesRow,
  CreatorLivePlatformShareItem,
  CreatorLiveTrendContributor,
} from './creator-live-dashboard-types';

export const CREATOR_LIVE_MATCH_STATUS_TAGS = {
  matched: { label: '已匹配', color: 'success' },
  unmatched: { label: '未匹配', color: 'warning' },
} as const;

export const CREATOR_MATCH_STATUS_FALLBACK_TAG = { label: '缺少达人ID' } as const;

export const CREATOR_LIVE_DASHBOARD_CLIENT_CONFIG = {
  dateBoundsEndpoint: '/dashboard/creator/live/date-bounds',
  dateBoundsRequestKey: 'creator-live-date-bounds',
  overviewEndpoint: '/dashboard/creator/live/overview',
  overviewRequestKey: 'creator-live-overview',
  detailsEndpoint: '/dashboard/creator/live/details',
  detailsRequestKey: 'creator-live-details',
  errorFallbackMessage: '直播达人看板数据加载失败，请检查迁移与 ETL 刷新状态。',
  loginRedirectPath: '/dashboard/creator/live',
} as const;

export const CREATOR_LIVE_METRIC_LABELS = {
  rosterInfluencerCount: '达人list人数',
  activeInfluencerCount: '达人直播人数',
  activeContentCount: '达人直播场数',
  gmv: '达人直播GMV',
  gsv: '达人直播GSV',
  refundRate: '直播退款率',
} as const;

export const CREATOR_LIVE_TREND_SHARE_CHART_CONFIG = {
  countLabel: '当日直播达人',
  platformLabel: '直播平台',
  trendSubtitle: '按直播日期（GMV 与 GSV）',
  gsvSeriesLabel: 'GSV',
  shareSubtitle: '按当前区间直播GMV统计',
  resolveDate: (row) => row.date,
  resolveGmvValue: (row) => row.live_gmv,
  resolveGsvBaseValue: (row) => row.live_gmv,
  resolveRefundAmount: (row) => row.live_refund_amount,
  resolveContributorCount: (row) => row.contributor_count,
  resolveContributors: (row) => row.contributors,
  resolveContributorPlatform: (item) => item.platform,
  resolveContributorName: (item) => item.influencer_name,
  resolveContributorGmv: (item) => item.live_gmv,
  resolveContributorGsv: (item) => item.live_gsv,
  resolvePlatformSharePlatform: (row) => row.platform,
  resolvePlatformShareGmv: (row) => row.live_gmv,
} satisfies CreatorDashboardTrendShareChartConfig<
  CreatorLiveOverviewSeriesRow,
  CreatorLiveTrendContributor,
  CreatorLivePlatformShareItem
>;

export const COOPERATION_STAGE_ORDER = buildCreatorCooperationStageOrder('已合作开播');
export const COOPERATION_STAGE_LABEL_ORDER = buildCreatorCooperationStageLabelOrder(COOPERATION_STAGE_ORDER);

export function normalizeCooperationStageKey(
  cooperationStatusNorm: string | null | undefined,
  cooperationStatusRaw: string | null | undefined
): CooperationStageKey {
  return normalizeBaseCooperationStageKey(cooperationStatusNorm, cooperationStatusRaw, ['已合作开播', '已开播']);
}

export const CREATOR_LIVE_COOPERATION_STAGE_STATE_CONFIG = {
  stages: COOPERATION_STAGE_ORDER,
  activeStageKey: 'live_started',
  resolveStageKey: (row) => normalizeCooperationStageKey(row.cooperation_status_norm, row.cooperation_status),
  resolveActiveStageSortValue: (row) => row.live_gmv,
  metrics: {
    gmv: (row) => row.live_gmv,
    gsvBaseAmount: (row) => row.live_gmv,
    refundAmount: (row) => row.live_refund_amount,
    refundRate: (row) => row.refund_rate,
  },
} satisfies CreatorDashboardCooperationStageStateConfig<CooperationStageKey, CreatorLiveDetailRow>;

export const CREATOR_LIVE_TABLE_STATE_CONFIG = {
  anchorLevel: {
    resolveStageKey: normalizeCooperationStageKey,
    formatDisplay: formatCooperationStatusDisplay,
  },
  detail: {
    base: {
      statusMap: CREATOR_LIVE_MATCH_STATUS_TAGS,
      fallbackStatus: CREATOR_MATCH_STATUS_FALLBACK_TAG,
      normalizePlatform: normalizeCooperationPlatform,
      resolveStageKey: normalizeCooperationStageKey,
      formatDisplay: formatCooperationStatusDisplay,
    },
    metrics: {
      contentLabel: '直播',
      gmvValue: (row) => row.live_gmv,
      buyerCount: (row) => row.live_buyer_count,
      orderCount: (row) => row.live_order_count,
      contentCount: (row) => row.live_session_count,
      watchCount: (row) => row.live_watch_user_count,
      userPayAmount: (row) => row.live_user_pay_amount,
      refundAmount: (row) => row.live_refund_amount,
    },
  },
} satisfies CreatorDashboardTableStateConfig<CreatorLiveDetailRow>;

export { COOPERATION_PLATFORM_PRIORITY_ORDER, formatCooperationStatusDisplay, normalizeCooperationPlatform };
