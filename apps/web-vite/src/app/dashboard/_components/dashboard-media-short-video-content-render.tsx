import type { ReactNode } from 'react';

import type { useDashboardMediaDetailExportActions } from './dashboard-media-detail-export-actions';
import type { useDashboardMediaDisplayState } from './dashboard-media-display-state';
import type {
  DashboardMediaContentsArgs,
} from './dashboard-media-content-types';
import type {
  useDashboardShortVideoMetricCardGroupState,
} from './dashboard-metric-card-derived-state';
import type { useDashboardShortVideoDerivedState } from './dashboard-short-video-derived-state';
import { DashboardShortVideoContentSection } from './dashboard-short-video-content-section';
import type { useDashboardShortVideoViewState } from './dashboard-short-video-view-state';

type DashboardMediaShortVideoContentRenderArgs = {
  args: DashboardMediaContentsArgs;
  shortVideoDerivedState: ReturnType<typeof useDashboardShortVideoDerivedState>;
  displayState: ReturnType<typeof useDashboardMediaDisplayState>;
  shortVideoViewState: ReturnType<typeof useDashboardShortVideoViewState>;
  shortVideoMetricCardGroupState: ReturnType<typeof useDashboardShortVideoMetricCardGroupState>;
  exportActions: ReturnType<typeof useDashboardMediaDetailExportActions>;
};

export function renderDashboardShortVideoContent({
  args,
  shortVideoDerivedState,
  displayState,
  shortVideoViewState,
  shortVideoMetricCardGroupState,
  exportActions,
}: DashboardMediaShortVideoContentRenderArgs): ReactNode {
  return (
    <DashboardShortVideoContentSection
      loadError={args.shortVideoLoadError}
      shortVideoScope={args.shortVideoScope}
      topMetricCards={shortVideoMetricCardGroupState.topMetricCards}
      bottomMetricCards={shortVideoMetricCardGroupState.bottomMetricCards}
      trendOption={shortVideoViewState.shortVideoTrendOption}
      onShortVideoScopeChange={args.setShortVideoScope}
      getTrendClassNameByRate={args.getTrendClassNameByRate}
      detailSectionProps={{
        ...args.detailSectionShellProps,
        isExporting: args.isExportingShortVideoDetails,
        disableExport: exportActions.disableShortVideoDetailExport,
        rows: shortVideoDerivedState.activeShortVideoDetailRows,
        loading: displayState.shortVideoDetailLoading,
        columns: shortVideoViewState.shortVideoDetailColumns,
        pagination: shortVideoViewState.shortVideoDetailTablePagination,
        emptyText: shortVideoViewState.shortVideoDetailEmptyText,
        onExport: exportActions.handleExportShortVideoDetailsAction,
      }}
    />
  );
}
