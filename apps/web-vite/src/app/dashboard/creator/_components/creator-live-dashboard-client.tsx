'use client';

import { useMemo } from 'react';
import { CreatorAnchorLevelDetailSection } from './creator-anchor-level-detail-section';
import { CreatorChartLayout } from './creator-chart-layout';
import { CreatorDashboardFrame } from './creator-dashboard-frame';
import { CreatorDetailSection } from './creator-detail-section';
import { CreatorMetricGrid } from './creator-metric-grid';
import { CreatorStatusSection } from './creator-status-section';
import { useCreatorDashboardClientState } from './creator-dashboard-client-state';
import { useCreatorDashboardCooperationStageState } from './creator-dashboard-cooperation-stage-state';
import { useCreatorDashboardDetailFilterState } from './creator-dashboard-detail-filter-state';
import { useCreatorDashboardDistributionChartState } from './creator-dashboard-distribution-chart-state';
import { useCreatorDashboardMetricState } from './creator-dashboard-metric-state';
import { useCreatorDashboardTableState } from './creator-dashboard-table-state';
import { useCreatorDashboardTrendShareChartState } from './creator-dashboard-trend-share-chart-state';
import {
  normalizeCreatorAnchorLevel as normalizeAnchorLevel,
  normalizeCreatorAnchorLevelFromChartParams,
} from './creator-chart-colors';
import {
  COOPERATION_PLATFORM_PRIORITY_ORDER,
  COOPERATION_STAGE_LABEL_ORDER,
  CREATOR_LIVE_COOPERATION_STAGE_STATE_CONFIG,
  CREATOR_LIVE_DASHBOARD_CLIENT_CONFIG,
  CREATOR_LIVE_METRIC_LABELS,
  CREATOR_LIVE_TABLE_STATE_CONFIG,
  CREATOR_LIVE_TREND_SHARE_CHART_CONFIG,
  formatCooperationStatusDisplay,
  normalizeCooperationStageKey,
  normalizeCooperationPlatform,
} from './creator-live-dashboard-model';
import { readCreatorArray } from './creator-helpers';
import { useCreatorLoginRedirect } from './creator-login-redirect';
import { useCreatorLiveCsvExport } from './creator-live-csv-export';
import type {
  CreatorLiveDetailRow,
  CreatorLiveDetailsApiResponse,
  CreatorLiveOverviewApiResponse,
} from './creator-live-dashboard-types';
import styles from './creator-live-dashboard.module.css';
import './creator-echarts';

export function CreatorLiveDashboardClient() {
  const {
    isMobile,
    messageApi,
    messageContextHolder,
    isAuthenticated,
    dateControls,
    detailFilters,
    data,
  } = useCreatorDashboardClientState<CreatorLiveOverviewApiResponse, CreatorLiveDetailsApiResponse>(
    CREATOR_LIVE_DASHBOARD_CLIENT_CONFIG
  );
  const {
    setDateMode,
    datePickerProps,
    currentRange,
    currentRangeLabel,
  } = dateControls;
  const {
    filterCooperationStatus,
    setFilterCooperationStatus,
    filterOwner,
    setFilterOwner,
    filterPlatform,
    setFilterPlatform,
    hasActiveDetailFilters,
    resetDetailFilters,
  } = detailFilters;
  const { overviewData, detailsData, loading, loadError } = data;

  const rosterTotals = overviewData?.rosterTotals;
  const detailSummary = detailsData?.summary;

  const { metricCards, showMetricSkeleton } = useCreatorDashboardMetricState({
    labels: CREATOR_LIVE_METRIC_LABELS,
    source: {
      rosterInfluencerCount: rosterTotals?.influencer_count,
      activeInfluencerCount: detailSummary?.live_influencer_count,
      activeContentCount: detailSummary?.live_session_count,
      gmv: detailSummary?.live_gmv,
      refundAmount: detailSummary?.live_refund_amount,
    },
    loading,
    hasOverviewData: Boolean(overviewData),
    hasDetailsData: Boolean(detailsData),
  });

  const { trendShareChartPanels } = useCreatorDashboardTrendShareChartState({
    seriesRows: overviewData?.currentSeries,
    platformShareRows: overviewData?.platformCurrent,
    loading,
    styles,
    config: CREATOR_LIVE_TREND_SHARE_CHART_CONFIG,
  });

  const detailRows = useMemo<CreatorLiveDetailRow[]>(() => {
    return [...readCreatorArray(detailsData?.rows)];
  }, [detailsData?.rows]);

  const {
    filteredDetailRows,
    cooperationStatusFilterOptions,
    ownerFilterOptions,
    platformFilterOptions,
    detailFilterCountText,
  } = useCreatorDashboardDetailFilterState({
    rows: detailRows,
    filters: detailFilters,
    cooperationStatusOrder: COOPERATION_STAGE_LABEL_ORDER,
    platformPriorityOrder: COOPERATION_PLATFORM_PRIORITY_ORDER,
  });

  const {
    selectedAnchorLevel,
    clearSelectedAnchorLevel,
    selectedAnchorLevelRows,
    distributionChartPanels,
  } = useCreatorDashboardDistributionChartState({
    rows: detailRows,
    loading,
    normalizeAnchorLevel,
    resolveAnchorLevelFromChartParams: normalizeCreatorAnchorLevelFromChartParams,
  });

  const {
    cooperationStageRows,
    selectedCooperationStage,
    setSelectedCooperationStage,
    cooperationStageTotalCount,
    selectedCooperationStageRows,
    showSelectedStageMetrics,
    getSelectedStageTableMetrics,
  } = useCreatorDashboardCooperationStageState({
    rows: detailRows,
    config: CREATOR_LIVE_COOPERATION_STAGE_STATE_CONFIG,
  });

  const {
    anchorLevelDetailColumns,
    anchorLevelTableScrollX,
    detailColumns,
    detailTableScrollX,
  } = useCreatorDashboardTableState({
    numericCellClassName: styles.numericCellRight,
    config: CREATOR_LIVE_TABLE_STATE_CONFIG,
  });

  const handleNavigateToLogin = useCreatorLoginRedirect(CREATOR_LIVE_DASHBOARD_CLIENT_CONFIG.loginRedirectPath);

  const { isExporting, handleExportCsv } = useCreatorLiveCsvExport({
    rows: filteredDetailRows,
    isAuthenticated,
    currentRange,
    messageApi,
  });

  return (
    <CreatorDashboardFrame
      activeTab="live"
      segmentedName="creator-live-date-mode"
      onDateModeChange={setDateMode}
      datePickerProps={datePickerProps}
      messageContextHolder={messageContextHolder}
      loadError={loadError}
      mainClassName={styles.dashboardFill}
      errorClassName={styles.errorBanner}
    >
      <CreatorMetricGrid loading={showMetricSkeleton} metrics={metricCards} />

      <CreatorChartLayout panels={distributionChartPanels} />

      <CreatorAnchorLevelDetailSection<CreatorLiveDetailRow>
        selectedAnchorLevel={selectedAnchorLevel}
        rows={selectedAnchorLevelRows}
        columns={anchorLevelDetailColumns}
        loading={loading}
        scrollX={anchorLevelTableScrollX}
        onClear={clearSelectedAnchorLevel}
      />

      <CreatorChartLayout panels={trendShareChartPanels} />

      <CreatorStatusSection
        loading={loading}
        hasDetails={detailRows.length > 0}
        stages={cooperationStageRows}
        totalCount={cooperationStageTotalCount}
        selectedStageKey={selectedCooperationStage}
        onSelectedStageChange={setSelectedCooperationStage}
        tableRows={selectedCooperationStageRows}
        showTableMetrics={showSelectedStageMetrics}
        getTableMetrics={getSelectedStageTableMetrics}
        normalizePlatform={normalizeCooperationPlatform}
        resolveStageKey={normalizeCooperationStageKey}
        formatDisplay={formatCooperationStatusDisplay}
      />

      <CreatorDetailSection<CreatorLiveDetailRow>
        title="直播达人明细（达人 + 直播表现）"
        subtitle={`${currentRangeLabel} · 默认按达人区间汇总`}
        isMobile={isMobile}
        cooperationStatusValue={filterCooperationStatus}
        cooperationStatusOptions={cooperationStatusFilterOptions}
        onCooperationStatusChange={setFilterCooperationStatus}
        ownerValue={filterOwner}
        ownerOptions={ownerFilterOptions}
        onOwnerChange={setFilterOwner}
        platformValue={filterPlatform}
        platformOptions={platformFilterOptions}
        onPlatformChange={setFilterPlatform}
        filterCountText={detailFilterCountText}
        onResetFilters={resetDetailFilters}
        resetDisabled={!hasActiveDetailFilters}
        exportLoading={isExporting}
        exportDisabled={!filteredDetailRows.length}
        onExport={handleExportCsv}
        isAuthenticated={isAuthenticated}
        onNavigateToLogin={handleNavigateToLogin}
        columns={detailColumns}
        dataSource={filteredDetailRows}
        loading={loading}
        scrollX={detailTableScrollX}
      />
    </CreatorDashboardFrame>
  );
}

export default CreatorLiveDashboardClient;
