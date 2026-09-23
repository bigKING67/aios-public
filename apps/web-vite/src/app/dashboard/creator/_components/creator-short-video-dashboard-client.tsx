'use client';

import { useMemo } from 'react';
import { CreatorChartLayout } from './creator-chart-layout';
import { CreatorDashboardFrame } from './creator-dashboard-frame';
import { CreatorDetailSection } from './creator-detail-section';
import { CreatorMetricGrid } from './creator-metric-grid';
import { useCreatorDashboardClientState } from './creator-dashboard-client-state';
import { useCreatorDashboardDetailFilterState } from './creator-dashboard-detail-filter-state';
import { useResolvedTableScrollX } from './creator-table-scroll';
import { readCreatorArray } from './creator-helpers';
import { useCreatorLoginRedirect } from './creator-login-redirect';
import styles from './creator-live-dashboard.module.css';
import { useCreatorShortVideoCsvExport } from './creator-short-video-csv-export';
import manualAttrStyles from './creator-short-video-manual-attrs.module.css';
import {
  CREATOR_SHORT_VIDEO_DASHBOARD_CLIENT_CONFIG,
  buildCreatorShortVideoSummaryRows,
  buildCreatorShortVideoDashboardMetricCards,
  formatCooperationStatusDisplay,
  normalizeCreatorShortVideoDetailRows,
  normalizeCooperationStageKey,
  resolveShortVideoCreatorFilterValues,
  resolveShortVideoOwnerFilterValues,
  resolveShortVideoProductFilterValues,
  resolveShortVideoSceneFilterValues,
  sortCreatorShortVideoDetailRows,
} from './creator-short-video-dashboard-model';
import { buildCreatorShortVideoDetailColumns } from './creator-short-video-detail-columns';
import { CreatorShortVideoSceneStrategyTree } from './creator-short-video-scene-strategy-tree';
import { buildCreatorShortVideoTrendChartOption } from './creator-short-video-trend-chart';
import type {
  CreatorShortVideoDetailRow,
  CreatorShortVideoDetailsApiResponse,
  CreatorShortVideoOverviewApiResponse,
} from './creator-short-video-dashboard-types';
import { useCreatorShortVideoManualAttrs } from './creator-short-video-manual-attrs';
import './creator-echarts';

const SHORT_VIDEO_METRIC_NOTE =
  '备注：总视频数、新视频数、出单数按视频ID去重，其中出单数表示出单视频数，不是订单数量；未匹配到视频ID的千川素材只计入千川GMV/GSV/消耗/订单数/ROI，不增加视频类数量。千川为素材广告归因，未维护视频/场景映射仍保留指标并进入未维护分组；挂车为罗盘末次成交归因，挂车GSV = 挂车GMV - 退款金额（退款时间）。';
const SHORT_VIDEO_DETAIL_TABLE_SCROLL_Y = 620;

export function CreatorShortVideoDashboardClient() {
  const {
    isMobile,
    messageApi,
    messageContextHolder,
    isAuthenticated,
    dateControls,
    detailFilters,
    data,
  } = useCreatorDashboardClientState<CreatorShortVideoOverviewApiResponse, CreatorShortVideoDetailsApiResponse>(
    CREATOR_SHORT_VIDEO_DASHBOARD_CLIENT_CONFIG
  );
  const {
    setDateMode,
    datePickerProps,
    currentRange,
    previousRange,
  } = dateControls;
  const {
    filterCreator,
    setFilterCreator,
    filterCooperationStatus,
    setFilterCooperationStatus,
    filterOwner,
    setFilterOwner,
    filterPlatform,
    setFilterPlatform,
    hasActiveDetailFilters,
    resetDetailFilters,
  } = detailFilters;
  const { overviewData, detailsData, previousDetailsData, loading, loadError, reload } = data;

  const detailRows = useMemo<CreatorShortVideoDetailRow[]>(() => {
    return normalizeCreatorShortVideoDetailRows(readCreatorArray(detailsData?.rows));
  }, [detailsData?.rows]);
  const previousDetailRows = useMemo<CreatorShortVideoDetailRow[]>(() => {
    return normalizeCreatorShortVideoDetailRows(readCreatorArray(previousDetailsData?.rows));
  }, [previousDetailsData?.rows]);

  const metricCards = useMemo(
    () => buildCreatorShortVideoDashboardMetricCards(detailRows, currentRange, previousDetailRows, previousRange),
    [currentRange, detailRows, previousDetailRows, previousRange]
  );
  const showMetricSkeleton = loading && !overviewData && !detailsData;

  const shortVideoTrendOption = useMemo(
    () => buildCreatorShortVideoTrendChartOption({ rows: detailRows, currentRange, styles }),
    [currentRange, detailRows]
  );
  const trendShareChartPanels = useMemo(
    () => [
      {
        title: '短视频千川/挂车GMV/GSV趋势',
        subtitle: '柱状图为千川广告归因 GMV/GSV，折线图为罗盘末次成交归因挂车 GMV/GSV。',
        option: shortVideoTrendOption,
        loading,
        emptyText: '当前区间暂无短视频千川与挂车趋势数据',
      },
    ],
    [loading, shortVideoTrendOption]
  );

  const {
    filteredDetailRows,
    creatorFilterOptions,
    cooperationStatusFilterOptions,
    ownerFilterOptions,
    platformFilterOptions,
    detailFilterCountText,
  } = useCreatorDashboardDetailFilterState({
    rows: detailRows,
    filters: detailFilters,
    cooperationStatusOrder: [],
    platformPriorityOrder: [],
    resolveCreator: resolveShortVideoCreatorFilterValues,
    resolveCooperationStatus: resolveShortVideoProductFilterValues,
    resolveOwner: resolveShortVideoSceneFilterValues,
    resolvePlatform: resolveShortVideoOwnerFilterValues,
  });
  const sortedFilteredDetailRows = useMemo(
    () => sortCreatorShortVideoDetailRows(filteredDetailRows),
    [filteredDetailRows]
  );
  const summaryDetailRows = useMemo(
    () => buildCreatorShortVideoSummaryRows(filteredDetailRows, currentRange),
    [currentRange, filteredDetailRows]
  );
  const sortedSummaryDetailRows = useMemo(
    () => sortCreatorShortVideoDetailRows(summaryDetailRows),
    [summaryDetailRows]
  );

  const { manualAttrColumns } = useCreatorShortVideoManualAttrs({
    detailRows,
    messageApi,
    reloadDetails: reload,
  });
  const shortVideoBaseDetailColumns = useMemo(
    () =>
      buildCreatorShortVideoDetailColumns({
        manualAttrColumns,
        resolveStageKey: normalizeCooperationStageKey,
        formatDisplay: formatCooperationStatusDisplay,
      }),
    [manualAttrColumns]
  );
  const shortVideoDetailTableScrollX = useResolvedTableScrollX(shortVideoBaseDetailColumns);

  const handleNavigateToLogin = useCreatorLoginRedirect(CREATOR_SHORT_VIDEO_DASHBOARD_CLIENT_CONFIG.loginRedirectPath);

  const {
    isExporting,
    handleExportCurrentSummaryCsv,
    handleExportTransactionDetailCsv,
  } = useCreatorShortVideoCsvExport({
    rows: sortedFilteredDetailRows,
    summaryRows: sortedSummaryDetailRows,
    isAuthenticated,
    currentRange,
    messageApi,
  });

  return (
    <CreatorDashboardFrame
      activeTab="short-video"
      segmentedName="creator-shortvideo-date-mode"
      onDateModeChange={setDateMode}
      datePickerProps={datePickerProps}
      messageContextHolder={messageContextHolder}
      loadError={loadError}
      mainClassName={styles.dashboardFill}
      errorClassName={styles.errorBanner}
    >
      <CreatorMetricGrid
        loading={showMetricSkeleton}
        metrics={metricCards}
        skeletonCount={12}
        featuredSkeletonCount={5}
        layout="shortVideoBusinessGroups"
      />

      <CreatorChartLayout panels={trendShareChartPanels} />

      <CreatorShortVideoSceneStrategyTree
        rows={detailRows}
        currentRange={currentRange}
        loading={loading}
      />

      <CreatorDetailSection<CreatorShortVideoDetailRow>
        title="短视频挂车达人维护明细"
        subtitle="人工维护字段按达人+视频维度保存。"
        headerVariant="inlineActions"
        isMobile={isMobile}
        creatorValue={filterCreator}
        creatorOptions={creatorFilterOptions}
        creatorFilterPlaceholder="按达人筛选"
        onCreatorChange={setFilterCreator}
        cooperationStatusValue={filterCooperationStatus}
        cooperationStatusOptions={cooperationStatusFilterOptions}
        cooperationStatusFilterPlaceholder="按产品筛选"
        onCooperationStatusChange={setFilterCooperationStatus}
        ownerValue={filterOwner}
        ownerOptions={ownerFilterOptions}
        ownerFilterPlaceholder="按场景筛选"
        onOwnerChange={setFilterOwner}
        platformValue={filterPlatform}
        platformOptions={platformFilterOptions}
        platformFilterPlaceholder="按负责人筛选"
        onPlatformChange={setFilterPlatform}
        filterCountText={detailFilterCountText}
        onResetFilters={resetDetailFilters}
        resetDisabled={!hasActiveDetailFilters}
        exportLoading={isExporting}
        exportDisabled={!sortedSummaryDetailRows.length}
        exportButtonLabel="导出明细"
        exportButtonTitle="展开后选择导出当前汇总或成交明细"
        exportMenuItems={[
          {
            key: 'current-summary',
            label: '导出当前汇总',
            title: '导出当前筛选和所选时间范围聚合后的素材/视频汇总',
            onClick: handleExportCurrentSummaryCsv,
          },
          {
            key: 'transaction-detail',
            label: '导出成交明细',
            title: '导出当前筛选范围内保留成交日期的原始明细',
            onClick: handleExportTransactionDetailCsv,
          },
        ]}
        onExport={handleExportTransactionDetailCsv}
        isAuthenticated={isAuthenticated}
        onNavigateToLogin={handleNavigateToLogin}
        columns={shortVideoBaseDetailColumns}
        dataSource={sortedSummaryDetailRows}
        loading={loading}
        rowClassName={manualAttrStyles.manualAttrColumnRow}
        scrollX={shortVideoDetailTableScrollX}
        scrollY={SHORT_VIDEO_DETAIL_TABLE_SCROLL_Y}
        paginationNote={SHORT_VIDEO_METRIC_NOTE}
      />
    </CreatorDashboardFrame>
  );
}

export default CreatorShortVideoDashboardClient;
