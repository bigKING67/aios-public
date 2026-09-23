import type {
  DashboardLiveDetailRow,
  DashboardLiveTrendRow,
  DashboardShortVideoDetailRow,
  DashboardShortVideoTrendRow,
  LiveMetricCard,
  LiveScope,
  ShortVideoScope,
} from './dashboard-types';

export type DashboardLiveScopeContentArgs = {
  liveScope: LiveScope;
  overviewMetricCards: LiveMetricCard[];
  selfMetricCards: LiveMetricCard[];
  influencerMetricCards: LiveMetricCard[];
  overviewTrendRows: DashboardLiveTrendRow[];
  selfTrendRows: DashboardLiveTrendRow[];
  influencerTrendRows: DashboardLiveTrendRow[];
  allDetailRows: DashboardLiveDetailRow[];
  selfDetailRows: DashboardLiveDetailRow[];
  influencerDetailRows: DashboardLiveDetailRow[];
};

export type DashboardLiveScopeContent = {
  metricCards: LiveMetricCard[];
  trendRows: DashboardLiveTrendRow[];
  detailRows: DashboardLiveDetailRow[];
};

export type DashboardShortVideoScopeContentArgs = {
  shortVideoScope: ShortVideoScope;
  overviewMetricCards: LiveMetricCard[];
  selfMetricCards: LiveMetricCard[];
  cooperationMetricCards: LiveMetricCard[];
  overviewTrendRows: DashboardShortVideoTrendRow[];
  selfTrendRows: DashboardShortVideoTrendRow[];
  cooperationTrendRows: DashboardShortVideoTrendRow[];
  allDetailRows: DashboardShortVideoDetailRow[];
  selfDetailRows: DashboardShortVideoDetailRow[];
  cooperationDetailRows: DashboardShortVideoDetailRow[];
};

export type DashboardShortVideoScopeContent = {
  metricCards: LiveMetricCard[];
  trendRows: DashboardShortVideoTrendRow[];
  detailRows: DashboardShortVideoDetailRow[];
};

export function resolveDashboardLiveScopeContent({
  liveScope,
  overviewMetricCards,
  selfMetricCards,
  influencerMetricCards,
  overviewTrendRows,
  selfTrendRows,
  influencerTrendRows,
  allDetailRows,
  selfDetailRows,
  influencerDetailRows,
}: DashboardLiveScopeContentArgs): DashboardLiveScopeContent {
  if (liveScope === 'self') {
    return {
      metricCards: selfMetricCards,
      trendRows: selfTrendRows,
      detailRows: selfDetailRows,
    };
  }
  if (liveScope === 'influencer') {
    return {
      metricCards: influencerMetricCards,
      trendRows: influencerTrendRows,
      detailRows: influencerDetailRows,
    };
  }
  return {
    metricCards: overviewMetricCards,
    trendRows: overviewTrendRows,
    detailRows: allDetailRows,
  };
}

export function resolveDashboardShortVideoScopeContent({
  shortVideoScope,
  overviewMetricCards,
  selfMetricCards,
  cooperationMetricCards,
  overviewTrendRows,
  selfTrendRows,
  cooperationTrendRows,
  allDetailRows,
  selfDetailRows,
  cooperationDetailRows,
}: DashboardShortVideoScopeContentArgs): DashboardShortVideoScopeContent {
  if (shortVideoScope === 'self') {
    return {
      metricCards: selfMetricCards,
      trendRows: selfTrendRows,
      detailRows: selfDetailRows,
    };
  }
  if (shortVideoScope === 'cooperation') {
    return {
      metricCards: cooperationMetricCards,
      trendRows: cooperationTrendRows,
      detailRows: cooperationDetailRows,
    };
  }
  return {
    metricCards: overviewMetricCards,
    trendRows: overviewTrendRows,
    detailRows: allDetailRows,
  };
}
