import { useMemo } from 'react';

import dayjs from 'dayjs';

import { buildDashboardLiveMetricCards } from './dashboard-metric-cards';
import { resolveDashboardLiveScopeContent } from './dashboard-scope-content';
import { compareText } from './dashboard-sorters';
import { dedupeLiveDetailRows } from './dashboard-live-detail-groups';
import type {
  DashboardLiveApiResponse,
  DashboardLiveDetailRow,
  DashboardLiveTrendRow,
  LiveMetricCard,
  LiveScope,
} from './dashboard-types';

type DashboardLiveDerivedStateArgs = {
  liveData: DashboardLiveApiResponse | null;
  liveScope: LiveScope;
};

type DashboardLiveDerivedState = {
  activeLiveMetricCards: LiveMetricCard[];
  activeLiveTrendRows: DashboardLiveTrendRow[];
  activeLiveDetailRows: DashboardLiveDetailRow[];
};

const EMPTY_LIVE_TREND_ROWS: DashboardLiveTrendRow[] = [];
const EMPTY_LIVE_DETAIL_ROWS: DashboardLiveDetailRow[] = [];

export function useDashboardLiveDerivedState({
  liveData,
  liveScope,
}: DashboardLiveDerivedStateArgs): DashboardLiveDerivedState {
  return useMemo(() => {
    const liveOverviewCurrentTotals = liveData?.overview?.currentTotals || null;
    const liveOverviewPreviousTotals = liveData?.overview?.previousTotals || null;
    const liveOverviewTrendRows = liveData?.overview?.trend || EMPTY_LIVE_TREND_ROWS;
    const liveSelfCurrentTotals = liveData?.selfLive?.currentTotals || null;
    const liveSelfPreviousTotals = liveData?.selfLive?.previousTotals || null;
    const liveSelfTrendRows = liveData?.selfLive?.trend || EMPTY_LIVE_TREND_ROWS;
    const liveInfluencerCurrentTotals = liveData?.influencerLive?.currentTotals || null;
    const liveInfluencerPreviousTotals = liveData?.influencerLive?.previousTotals || null;
    const liveInfluencerTrendRows = liveData?.influencerLive?.trend || EMPTY_LIVE_TREND_ROWS;
    const liveSelfDetailRows = dedupeLiveDetailRows(
      Array.isArray(liveData?.selfLive?.rows) ? liveData.selfLive.rows : EMPTY_LIVE_DETAIL_ROWS
    );
    const liveInfluencerDetailRows = dedupeLiveDetailRows(
      Array.isArray(liveData?.influencerLive?.rows) ? liveData.influencerLive.rows : EMPTY_LIVE_DETAIL_ROWS
    );
    const allLiveDetailRows = dedupeLiveDetailRows([...liveSelfDetailRows, ...liveInfluencerDetailRows]).sort(
      (left, right) => {
        const leftTime = dayjs(left.live_start_time).valueOf();
        const rightTime = dayjs(right.live_start_time).valueOf();
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        return compareText(left.anchor_nickname || '', right.anchor_nickname || '');
      }
    );
    const liveOverviewMetricCards = buildDashboardLiveMetricCards(
      liveOverviewCurrentTotals,
      liveOverviewPreviousTotals
    );
    const liveSelfMetricCards = buildDashboardLiveMetricCards(liveSelfCurrentTotals, liveSelfPreviousTotals);
    const liveInfluencerMetricCards = buildDashboardLiveMetricCards(
      liveInfluencerCurrentTotals,
      liveInfluencerPreviousTotals
    );
    const activeLiveScopeContent = resolveDashboardLiveScopeContent({
      liveScope,
      overviewMetricCards: liveOverviewMetricCards,
      selfMetricCards: liveSelfMetricCards,
      influencerMetricCards: liveInfluencerMetricCards,
      overviewTrendRows: liveOverviewTrendRows,
      selfTrendRows: liveSelfTrendRows,
      influencerTrendRows: liveInfluencerTrendRows,
      allDetailRows: allLiveDetailRows,
      selfDetailRows: liveSelfDetailRows,
      influencerDetailRows: liveInfluencerDetailRows,
    });

    return {
      activeLiveMetricCards: activeLiveScopeContent.metricCards,
      activeLiveTrendRows: activeLiveScopeContent.trendRows,
      activeLiveDetailRows: activeLiveScopeContent.detailRows,
    };
  }, [liveData, liveScope]);
}
