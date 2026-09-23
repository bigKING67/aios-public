import { useMemo } from 'react';

import dayjs from 'dayjs';

import { buildDashboardShortVideoMetricCards } from './dashboard-metric-cards';
import { resolveDashboardShortVideoScopeContent } from './dashboard-scope-content';
import { compareText } from './dashboard-sorters';
import type {
  DashboardShortVideoApiResponse,
  DashboardShortVideoDetailRow,
  DashboardShortVideoTrendRow,
  LiveMetricCard,
  ShortVideoScope,
} from './dashboard-types';

type DashboardShortVideoDerivedStateArgs = {
  shortVideoData: DashboardShortVideoApiResponse | null;
  shortVideoScope: ShortVideoScope;
};

type DashboardShortVideoDerivedState = {
  activeShortVideoMetricCards: LiveMetricCard[];
  activeShortVideoTrendRows: DashboardShortVideoTrendRow[];
  activeShortVideoDetailRows: DashboardShortVideoDetailRow[];
};

const EMPTY_SHORT_VIDEO_TREND_ROWS: DashboardShortVideoTrendRow[] = [];
const EMPTY_SHORT_VIDEO_DETAIL_ROWS: DashboardShortVideoDetailRow[] = [];

export function useDashboardShortVideoDerivedState({
  shortVideoData,
  shortVideoScope,
}: DashboardShortVideoDerivedStateArgs): DashboardShortVideoDerivedState {
  return useMemo(() => {
    const shortVideoOverviewCurrentTotals = shortVideoData?.overview?.currentTotals || null;
    const shortVideoOverviewPreviousTotals = shortVideoData?.overview?.previousTotals || null;
    const shortVideoOverviewTrendRows = shortVideoData?.overview?.trend || EMPTY_SHORT_VIDEO_TREND_ROWS;
    const shortVideoSelfCurrentTotals = shortVideoData?.selfOperated?.currentTotals || null;
    const shortVideoSelfPreviousTotals = shortVideoData?.selfOperated?.previousTotals || null;
    const shortVideoSelfTrendRows = shortVideoData?.selfOperated?.trend || EMPTY_SHORT_VIDEO_TREND_ROWS;
    const shortVideoCooperationCurrentTotals = shortVideoData?.cooperation?.currentTotals || null;
    const shortVideoCooperationPreviousTotals = shortVideoData?.cooperation?.previousTotals || null;
    const shortVideoCooperationTrendRows = shortVideoData?.cooperation?.trend || EMPTY_SHORT_VIDEO_TREND_ROWS;
    const shortVideoSelfDetailRows: DashboardShortVideoDetailRow[] = Array.isArray(shortVideoData?.selfOperated?.rows)
      ? shortVideoData.selfOperated.rows
      : EMPTY_SHORT_VIDEO_DETAIL_ROWS;
    const shortVideoCooperationDetailRows: DashboardShortVideoDetailRow[] = Array.isArray(shortVideoData?.cooperation?.rows)
      ? shortVideoData.cooperation.rows
      : EMPTY_SHORT_VIDEO_DETAIL_ROWS;
    const allShortVideoDetailRows = [...shortVideoSelfDetailRows, ...shortVideoCooperationDetailRows].sort(
      (left, right) => {
        const leftDate = dayjs(left.stat_date).valueOf();
        const rightDate = dayjs(right.stat_date).valueOf();
        if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) {
          return rightDate - leftDate;
        }
        const leftPublish = dayjs(left.publish_time || '').valueOf();
        const rightPublish = dayjs(right.publish_time || '').valueOf();
        if (Number.isFinite(leftPublish) && Number.isFinite(rightPublish) && leftPublish !== rightPublish) {
          return rightPublish - leftPublish;
        }
        return compareText(left.author_nickname || '', right.author_nickname || '');
      }
    );
    const shortVideoOverviewMetricCards = buildDashboardShortVideoMetricCards(
      shortVideoOverviewCurrentTotals,
      shortVideoOverviewPreviousTotals
    );
    const shortVideoSelfMetricCards = buildDashboardShortVideoMetricCards(
      shortVideoSelfCurrentTotals,
      shortVideoSelfPreviousTotals
    );
    const shortVideoCooperationMetricCards = buildDashboardShortVideoMetricCards(
      shortVideoCooperationCurrentTotals,
      shortVideoCooperationPreviousTotals
    );
    const activeShortVideoScopeContent = resolveDashboardShortVideoScopeContent({
      shortVideoScope,
      overviewMetricCards: shortVideoOverviewMetricCards,
      selfMetricCards: shortVideoSelfMetricCards,
      cooperationMetricCards: shortVideoCooperationMetricCards,
      overviewTrendRows: shortVideoOverviewTrendRows,
      selfTrendRows: shortVideoSelfTrendRows,
      cooperationTrendRows: shortVideoCooperationTrendRows,
      allDetailRows: allShortVideoDetailRows,
      selfDetailRows: shortVideoSelfDetailRows,
      cooperationDetailRows: shortVideoCooperationDetailRows,
    });

    return {
      activeShortVideoMetricCards: activeShortVideoScopeContent.metricCards,
      activeShortVideoTrendRows: activeShortVideoScopeContent.trendRows,
      activeShortVideoDetailRows: activeShortVideoScopeContent.detailRows,
    };
  }, [shortVideoData, shortVideoScope]);
}
