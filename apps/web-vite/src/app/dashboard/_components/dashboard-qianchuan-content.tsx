import { DownloadOutlined } from '@ant-design/icons';
import { Button, Empty, Segmented, Table } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';

import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import { DashboardChart } from './dashboard-chart';
import chartStyles from './dashboard-chart.module.css';
import type { DashboardDateRangeLike } from './dashboard-date-range';
import {
  formatCompactWanCurrency,
  formatCompactWanInteger,
  formatTableNumber,
  formatTableRate,
} from './dashboard-formatters';
import { calculateRateChange } from './dashboard-metric-card-calculations';
import { DashboardMetricCardSection } from './dashboard-metric-card-section';
import noticeStyles from './dashboard-notice.module.css';
import {
  buildDashboardQianchuanLiveRoomScreenColumns,
  buildDashboardQianchuanLiveVideoColumns,
  buildDashboardQianchuanMaterialTypeMixColumns,
  type DashboardQianchuanTableClassNames,
} from './dashboard-qianchuan-columns';
import { useDashboardQianchuanDetailExportActions } from './dashboard-qianchuan-detail-export-actions';
import { buildDashboardQianchuanTrendOption } from './dashboard-qianchuan-trend-option';
import type {
  DashboardQianchuanApiResponse,
  DashboardQianchuanCommonRow,
  DashboardQianchuanLiveRoomScreenRow,
  DashboardQianchuanLiveVideoRow,
  DashboardQianchuanMaterialScopeKey,
  DashboardQianchuanMaterialScopeSummary,
  DashboardQianchuanMaterialType,
  DashboardQianchuanMaterialTypeMixRow,
  DashboardQianchuanMetricTotals,
  DashboardQianchuanMetricValue,
  DashboardQianchuanTrendRow,
} from './dashboard-qianchuan-types';
import { buildDashboardDetailTablePagination, buildDashboardTableEmptyContent } from './dashboard-table-state';
import trafficSectionControlStyles from './dashboard-traffic-section-control.module.css';
import trafficSectionHeaderStyles from './dashboard-traffic-section-header.module.css';
import trafficSectionStyles from './dashboard-traffic-section.module.css';
import type { LiveMetricCard } from './dashboard-types';
import styles from './dashboard-qianchuan-content.module.css';

export type DashboardQianchuanContentProps = {
  data?: DashboardQianchuanApiResponse | null;
  loading?: boolean;
  loadError?: unknown;
  isMobile: boolean;
  qianchuanData?: DashboardQianchuanApiResponse | null;
  qianchuanLoading?: boolean;
  qianchuanLoadError?: unknown;
  currentRange?: DashboardDateRangeLike;
  isAuthenticated?: boolean;
  messageApi?: MessageInstance;
  tableClassNames?: DashboardQianchuanTableClassNames;
};

type QianchuanMetricDefinition = {
  key: string;
  keys: string[];
  label: string;
  format: LiveMetricCard['format'];
};

type QianchuanMetricCardGroups = {
  topCards: LiveMetricCard[];
  bottomCards: LiveMetricCard[];
  bottomCardRows?: LiveMetricCard[][];
  bottomGridColumnCounts?: number[];
};

const QIANCHUAN_SCOPE_OPTIONS: Array<{ label: string; value: DashboardQianchuanMaterialScopeKey }> = [
  { label: '全部', value: 'all' },
  { label: '视频', value: 'video' },
  { label: '直播间画面', value: 'liveRoomScreen' },
];

const QIANCHUAN_DETAIL_MOBILE_PAGE_SIZE = 8;
const QIANCHUAN_DETAIL_DESKTOP_PAGE_SIZE = 20;

type QianchuanDetailTableKey = 'materialTypeMix' | 'liveVideo' | 'liveRoomScreen';

type QianchuanDetailPaginationState = Record<QianchuanDetailTableKey, { current: number; pageSize: number }>;

function createQianchuanDetailPaginationState(): QianchuanDetailPaginationState {
  return {
    materialTypeMix: { current: 1, pageSize: QIANCHUAN_DETAIL_DESKTOP_PAGE_SIZE },
    liveVideo: { current: 1, pageSize: QIANCHUAN_DETAIL_DESKTOP_PAGE_SIZE },
    liveRoomScreen: { current: 1, pageSize: QIANCHUAN_DETAIL_DESKTOP_PAGE_SIZE },
  };
}

const QIANCHUAN_SCOPE_LABELS: Record<DashboardQianchuanMaterialScopeKey, string> = {
  all: '全部',
  video: '视频',
  liveRoomScreen: '直播间画面',
};

const QIANCHUAN_SCOPE_RESPONSE_KEYS: Record<DashboardQianchuanMaterialScopeKey, string[]> = {
  all: ['all'],
  video: ['video', 'liveVideo', 'live_video'],
  liveRoomScreen: ['liveRoomScreen', 'live_room_screen'],
};

const QIANCHUAN_TOP_METRICS: QianchuanMetricDefinition[] = [
  {
    key: 'overall_cost',
    keys: ['overallCost', 'overall_cost', 'costAmount', 'cost_amount'],
    label: '整体消耗',
    format: 'currency',
  },
  {
    key: 'overall_gmv',
    keys: ['overallGmv', 'overall_gmv'],
    label: '整体成交金额',
    format: 'currency',
  },
  {
    key: 'overall_pay_roi',
    keys: ['overallPayRoi', 'overall_pay_roi', 'payRoi', 'pay_roi'],
    label: '整体支付 ROI',
    format: 'number',
  },
  {
    key: 'net_gmv_roi',
    keys: ['netGmvRoi', 'net_gmv_roi'],
    label: '净成交 ROI',
    format: 'number',
  },
];

const QIANCHUAN_SCOPED_TOP_METRICS: QianchuanMetricDefinition[] = [
  {
    key: 'overall_cost',
    keys: ['overallCost', 'overall_cost', 'costAmount', 'cost_amount'],
    label: '整体消耗',
    format: 'currency',
  },
  {
    key: 'overall_gmv',
    keys: ['overallGmv', 'overall_gmv'],
    label: '整体成交',
    format: 'currency',
  },
  {
    key: 'overall_pay_roi',
    keys: ['overallPayRoi', 'overall_pay_roi', 'payRoi', 'pay_roi'],
    label: '支付 ROI',
    format: 'number',
  },
  {
    key: 'overall_cost_share',
    keys: ['overallCostShare', 'overall_cost_share', 'overallCostRatio', 'overall_cost_ratio'],
    label: '消耗占比',
    format: 'rate',
  },
];

const QIANCHUAN_ALL_BOTTOM_METRIC_ROWS: QianchuanMetricDefinition[][] = [
  [
    { key: 'net_gmv', keys: ['netGmv', 'net_gmv'], label: '净成交金额', format: 'currency' },
    { key: 'net_order_cost', keys: ['netOrderCost', 'net_order_cost'], label: '净成交订单成本', format: 'currency' },
    { key: 'refund_rate_1h', keys: ['refundRate1h', 'refund_rate_1h'], label: '1小时内退款率', format: 'rate' },
    {
      key: 'settlement_roi_7d',
      keys: ['settlementRoi7d', 'settlement_roi_7d'],
      label: '7日结算 ROI',
      format: 'number',
    },
    {
      key: 'settlement_roi_14d',
      keys: ['settlementRoi14d', 'settlement_roi_14d'],
      label: '14日结算 ROI',
      format: 'number',
    },
    {
      key: 'settlement_roi_30d',
      keys: ['settlementRoi30d', 'settlement_roi_30d'],
      label: '30日结算 ROI',
      format: 'number',
    },
  ],
];

const QIANCHUAN_ALL_BOTTOM_METRICS = QIANCHUAN_ALL_BOTTOM_METRIC_ROWS.flat();

const QIANCHUAN_SCOPED_BOTTOM_METRIC_ROWS: QianchuanMetricDefinition[][] = [
  [
    {
      key: 'overall_impression_count',
      keys: ['overallImpressionCount', 'overall_impression_count', 'impressionCount', 'impression_count'],
      label: '展示次数',
      format: 'integer',
    },
    {
      key: 'overall_click_count',
      keys: ['overallClickCount', 'overall_click_count', 'clickCount', 'click_count'],
      label: '点击次数',
      format: 'integer',
    },
    {
      key: 'overall_click_rate',
      keys: ['overallClickRate', 'overall_click_rate', 'clickRate', 'click_rate'],
      label: '点击率',
      format: 'rate',
    },
    {
      key: 'overall_conversion_rate',
      keys: ['overallConversionRate', 'overall_conversion_rate', 'conversionRate', 'conversion_rate'],
      label: '转化率',
      format: 'rate',
    },
    {
      key: 'overall_order_count',
      keys: ['overallOrderCount', 'overall_order_count', 'orderCount', 'order_count'],
      label: '成交订单数',
      format: 'integer',
    },
    {
      key: 'overall_cpm',
      keys: ['overallCpm', 'overall_cpm'],
      label: 'CPM',
      format: 'currency',
    },
  ],
];

const QIANCHUAN_SCOPED_BOTTOM_METRICS = QIANCHUAN_SCOPED_BOTTOM_METRIC_ROWS.flat();

function asRecord(value: object | null | undefined): Record<string, unknown> {
  return (value || {}) as Record<string, unknown>;
}

function pickValue(value: object | null | undefined, keys: string[]): unknown {
  const record = asRecord(value);
  for (const key of keys) {
    const candidate = record[key];
    if (candidate !== null && candidate !== undefined && candidate !== '') {
      return candidate;
    }
  }
  return null;
}

function readText(value: object | null | undefined, keys: string[]): string {
  const candidate = pickValue(value, keys);
  if (candidate === null || candidate === undefined) {
    return '';
  }
  return String(candidate).trim();
}

function readMetric(value: object | null | undefined, keys: string[]): DashboardQianchuanMetricValue {
  const candidate = pickValue(value, keys);
  if (typeof candidate === 'number' || typeof candidate === 'string') {
    return candidate;
  }
  return null;
}

function toNumber(value: DashboardQianchuanMetricValue | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMetricValue(value: DashboardQianchuanMetricValue | undefined, format: LiveMetricCard['format']): string {
  if (format === 'currency') {
    return formatCompactWanCurrency(value ?? null);
  }
  if (format === 'integer') {
    return formatCompactWanInteger(value ?? null);
  }
  if (format === 'rate') {
    return formatTableRate(value ?? null);
  }
  return formatTableNumber(value ?? null, 2);
}

function buildMetricCard(
  definition: QianchuanMetricDefinition,
  currentTotals: DashboardQianchuanMetricTotals | null | undefined,
  previousTotals: DashboardQianchuanMetricTotals | null | undefined
): LiveMetricCard {
  const currentValue = readMetric(currentTotals, definition.keys);
  const previousValue = readMetric(previousTotals, definition.keys);

  return {
    key: definition.key,
    label: definition.label,
    value: formatMetricValue(currentValue, definition.format),
    wow: calculateRateChange(currentValue ?? null, previousValue ?? null),
    currentRaw: toNumber(currentValue),
    previousRaw: toNumber(previousValue),
    format: definition.format,
  };
}

function buildMetricCardGroups({
  scope,
  currentTotals,
  previousTotals,
}: {
  scope: DashboardQianchuanMaterialScopeKey;
  currentTotals: DashboardQianchuanMetricTotals | null | undefined;
  previousTotals: DashboardQianchuanMetricTotals | null | undefined;
}): QianchuanMetricCardGroups {
  const topDefinitions = scope === 'all' ? QIANCHUAN_TOP_METRICS : QIANCHUAN_SCOPED_TOP_METRICS;
  const topCards = topDefinitions.map((definition) =>
    buildMetricCard(definition, currentTotals, previousTotals)
  );

  if (scope === 'all') {
    const bottomCardRows = QIANCHUAN_ALL_BOTTOM_METRIC_ROWS.map((row) =>
      row.map((definition) => buildMetricCard(definition, currentTotals, previousTotals))
    );

    return {
      topCards,
      bottomCards: QIANCHUAN_ALL_BOTTOM_METRICS.map((definition) =>
        buildMetricCard(definition, currentTotals, previousTotals)
      ),
      bottomCardRows,
      bottomGridColumnCounts: [6],
    };
  }

  return {
    topCards,
    bottomCards: QIANCHUAN_SCOPED_BOTTOM_METRICS.map((definition) =>
      buildMetricCard(definition, currentTotals, previousTotals)
    ),
    bottomCardRows: QIANCHUAN_SCOPED_BOTTOM_METRIC_ROWS.map((row) =>
      row.map((definition) => buildMetricCard(definition, currentTotals, previousTotals))
    ),
  };
}

function deriveCostShare(
  scopeTotals: DashboardQianchuanMetricTotals | null | undefined,
  allTotals: DashboardQianchuanMetricTotals | null | undefined
): number | null {
  const scopeCost = toNumber(readMetric(scopeTotals, ['overallCost', 'overall_cost', 'costAmount', 'cost_amount']));
  const allCost = toNumber(readMetric(allTotals, ['overallCost', 'overall_cost', 'costAmount', 'cost_amount']));

  if (scopeCost === null || allCost === null || allCost <= 0) {
    return null;
  }

  return scopeCost / allCost;
}

function withDerivedCostShare(
  scope: DashboardQianchuanMaterialScopeKey,
  scopeTotals: DashboardQianchuanMetricTotals | null | undefined,
  allTotals: DashboardQianchuanMetricTotals | null | undefined
): DashboardQianchuanMetricTotals | null | undefined {
  if (scope === 'all' || !scopeTotals) {
    return scopeTotals;
  }

  const costShare = deriveCostShare(scopeTotals, allTotals);
  return {
    ...scopeTotals,
    overallCostShare: costShare,
    overall_cost_share: costShare,
    overallCostRatio: costShare,
    overall_cost_ratio: costShare,
  };
}

function getTrendClassName(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return styles.trendNeutral;
  }
  if (value > 0) {
    return styles.trendUp;
  }
  if (value < 0) {
    return styles.trendDown;
  }
  return styles.trendNeutral;
}

function getLoadErrorMessage(loadError: unknown): string | null {
  if (!loadError) {
    return null;
  }
  if (typeof loadError === 'string') {
    return loadError;
  }
  if (loadError instanceof Error) {
    return loadError.message || '千川看板数据拉取失败';
  }
  return '千川看板数据拉取失败';
}

function getMaterialType(row: DashboardQianchuanCommonRow | DashboardQianchuanMaterialTypeMixRow): string {
  return readText(row, ['materialType', 'material_type']);
}

function getRowsByMaterialType<Row extends DashboardQianchuanCommonRow>(
  rows: Row[] | null | undefined,
  materialType: DashboardQianchuanMaterialType
): Row[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const hasExplicitMaterialType = rows.some((row) => Boolean(getMaterialType(row)));
  if (!hasExplicitMaterialType) {
    return rows;
  }

  return rows.filter((row) => {
    const rowMaterialType = getMaterialType(row);
    return rowMaterialType === materialType;
  });
}

function getScopeSummary(
  responseData: DashboardQianchuanApiResponse | null,
  scope: DashboardQianchuanMaterialScopeKey
): DashboardQianchuanMaterialScopeSummary | null {
  const scopes = responseData?.materialScopes ?? responseData?.material_scopes ?? null;
  const scopesRecord = scopes as Record<string, DashboardQianchuanMaterialScopeSummary | null | undefined> | null;
  if (!scopesRecord) {
    return null;
  }

  for (const key of QIANCHUAN_SCOPE_RESPONSE_KEYS[scope]) {
    const summary = scopesRecord[key];
    if (summary) {
      return summary;
    }
  }

  return null;
}

function getScopeCurrentTotals(
  summary: DashboardQianchuanMaterialScopeSummary | null,
  fallback: DashboardQianchuanMetricTotals | null
): DashboardQianchuanMetricTotals | null {
  return summary?.currentTotals ?? summary?.current_totals ?? fallback;
}

function getScopePreviousTotals(
  summary: DashboardQianchuanMaterialScopeSummary | null,
  fallback: DashboardQianchuanMetricTotals | null
): DashboardQianchuanMetricTotals | null {
  return summary?.previousTotals ?? summary?.previous_totals ?? fallback;
}

function getScopeTrendRows(
  summary: DashboardQianchuanMaterialScopeSummary | null,
  fallback: DashboardQianchuanTrendRow[]
): DashboardQianchuanTrendRow[] {
  return summary?.trend ?? fallback;
}

function hasMetricTotals(totals: DashboardQianchuanMetricTotals | null | undefined): boolean {
  return Boolean(
    totals &&
      Object.values(totals).some((value) => value !== null && value !== undefined && value !== '')
  );
}

function getTrendTitle(scope: DashboardQianchuanMaterialScopeKey): string {
  if (scope === 'video') {
    return '视频趋势';
  }
  if (scope === 'liveRoomScreen') {
    return '直播间画面趋势';
  }
  return '千川趋势';
}

function getTableEmptyContent({
  loading,
  loadErrorMessage,
  emptyDescription,
}: {
  loading: boolean;
  loadErrorMessage: string | null;
  emptyDescription: string;
}): ReactNode {
  return buildDashboardTableEmptyContent({
    isLoading: loading,
    hasLoadError: Boolean(loadErrorMessage),
    loadingText: '千川看板数据加载中',
    errorText: '千川看板数据加载失败，请查看上方提示',
    emptyDescription,
  });
}

function getTableClassNames(): DashboardQianchuanTableClassNames {
  return {
    tableHeaderCell: styles.tableHeaderCell,
    tableBodyCell: styles.tableBodyCell,
    tableTextHeaderCell: styles.tableTextHeaderCell,
    tableTextBodyCell: styles.tableTextBodyCell,
    tableTextBodyCellLeft: styles.tableTextBodyCellLeft,
    tableIdentityCell: styles.tableIdentityCell,
    tableIdentityCellLeft: styles.tableIdentityCellLeft,
    tableIdentityName: styles.tableIdentityName,
    tableVideoName: styles.tableVideoName,
    tableVideoLink: styles.tableVideoLink,
    tableIdentityMeta: styles.tableIdentityMeta,
    tableTypeTag: styles.tableTypeTag,
  };
}

function mergeTableClassNames(
  defaults: DashboardQianchuanTableClassNames,
  overrides: DashboardQianchuanTableClassNames | undefined
): DashboardQianchuanTableClassNames {
  if (!overrides) {
    return defaults;
  }

  return Object.fromEntries(
    Object.entries({ ...defaults, ...overrides }).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ) as DashboardQianchuanTableClassNames;
}

function getLiveRoomRowKey(row: DashboardQianchuanLiveRoomScreenRow, index?: number): string {
  const parts = [
    readText(row, ['statDate', 'stat_date']),
    readText(row, ['materialKey', 'material_key']),
    readText(row, ['douyinAccountDisplayId', 'douyin_account_display_id']),
    readText(row, ['douyinAccountName', 'douyin_account_name']),
    readText(row, ['promotionType', 'promotion_type']),
  ].filter(Boolean);

  return parts.length > 0 ? `live-room-screen:${parts.join(':')}` : `live-room-screen-row-${index ?? 0}`;
}

function getLiveVideoRowKey(row: DashboardQianchuanLiveVideoRow, index?: number): string {
  const parts = [
    readText(row, ['statDate', 'stat_date']),
    readText(row, ['douyinAccountDisplayId', 'douyin_account_display_id']),
    readText(row, ['materialId', 'material_id']),
    readText(row, ['materialKey', 'material_key']),
    readText(row, ['materialVideoName', 'material_video_name']),
    readText(row, ['liveRoomName', 'live_room_name']),
    readText(row, ['globalMaterialVideoType', 'global_material_video_type']),
  ].filter(Boolean);

  return parts.length > 0 ? `live-video:${parts.join(':')}` : `live-video-row-${index ?? 0}`;
}

function renderSectionHead({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description: string;
  meta?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.sectionHead}>
      <div className={styles.sectionHeadMain}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      {meta || actions ? (
        <div className={styles.sectionHeadAside}>
          {meta ? <span className={styles.sectionMeta}>{meta}</span> : null}
          {actions}
        </div>
      ) : null}
    </header>
  );
}

function renderDataTable<Row extends object>({
  rows,
  loading,
  columns,
  emptyText,
  rowKey,
  isMobile,
  scrollX,
  paginationState,
  onPaginationChange,
}: {
  rows: Row[];
  loading: boolean;
  columns: ColumnsType<Row>;
  emptyText: ReactNode;
  rowKey: (row: Row, index?: number) => string;
  isMobile: boolean;
  scrollX: number | 'max-content';
  paginationState: { current: number; pageSize: number };
  onPaginationChange: (page: number, pageSize: number) => void;
}) {
  const pageSize = isMobile ? QIANCHUAN_DETAIL_MOBILE_PAGE_SIZE : paginationState.pageSize;

  return (
    <Table<Row>
      rowKey={rowKey}
      className={styles.table}
      columns={columns}
      dataSource={rows}
      loading={loading}
      size="small"
      sortDirections={['ascend', 'descend']}
      scroll={{ x: scrollX }}
      pagination={buildDashboardDetailTablePagination({
        isMobile,
        mobilePageSize: QIANCHUAN_DETAIL_MOBILE_PAGE_SIZE,
        desktopPageSize: QIANCHUAN_DETAIL_DESKTOP_PAGE_SIZE,
        current: paginationState.current,
        pageSize,
        onChange: onPaginationChange,
      })}
      rowClassName={() => styles.tableRow}
      locale={{ emptyText }}
    />
  );
}

export function DashboardQianchuanContent({
  data,
  loading,
  loadError,
  isMobile,
  qianchuanData,
  qianchuanLoading,
  qianchuanLoadError,
  currentRange,
  isAuthenticated = true,
  messageApi,
  tableClassNames: tableClassNamesOverride,
}: DashboardQianchuanContentProps) {
  const [activeScope, setActiveScope] = useState<DashboardQianchuanMaterialScopeKey>('all');
  const [detailPagination, setDetailPagination] = useState<QianchuanDetailPaginationState>(
    createQianchuanDetailPaginationState
  );
  const responseData = data ?? qianchuanData ?? null;
  const isLoading = loading ?? qianchuanLoading ?? false;
  const loadErrorMessage = getLoadErrorMessage(loadError ?? qianchuanLoadError);
  const legacyCurrentTotals =
    responseData?.overview?.currentTotals ?? responseData?.overview?.current_totals ?? null;
  const legacyPreviousTotals =
    responseData?.overview?.previousTotals ?? responseData?.overview?.previous_totals ?? null;
  const legacyTrendRows = responseData?.overview?.trend ?? [];
  const materialTypeMixRows = responseData?.materialTypeMix ?? responseData?.material_type_mix ?? [];
  const liveRoomScreenRows = getRowsByMaterialType(
    responseData?.liveRoomScreen?.rows ?? responseData?.live_room_screen?.rows,
    'live_room_screen'
  );
  const liveVideoRows = getRowsByMaterialType(
    responseData?.liveVideo?.rows ?? responseData?.live_video?.rows,
    'live_video'
  );
  const activeScopeSummary = getScopeSummary(responseData, activeScope);
  const activeScopeFactRowCount =
    activeScope === 'video'
      ? liveVideoRows.length
      : activeScope === 'liveRoomScreen'
        ? liveRoomScreenRows.length
        : liveRoomScreenRows.length + liveVideoRows.length;
  const hasActiveScopeFactRows =
    activeScope === 'all'
      ? materialTypeMixRows.length > 0 || activeScopeFactRowCount > 0
      : activeScopeFactRowCount > 0;
  const scopeFallbackCurrentTotals = activeScope === 'all' ? legacyCurrentTotals : null;
  const scopeFallbackPreviousTotals = activeScope === 'all' ? legacyPreviousTotals : null;
  const scopeFallbackTrendRows = activeScope === 'all' ? legacyTrendRows : [];
  const activeCurrentTotals = getScopeCurrentTotals(activeScopeSummary, scopeFallbackCurrentTotals);
  const activePreviousTotals = getScopePreviousTotals(activeScopeSummary, scopeFallbackPreviousTotals);
  const activeTrendRows = getScopeTrendRows(activeScopeSummary, scopeFallbackTrendRows);
  const hasScopeSummaryData =
    Boolean(activeScopeSummary) ||
    hasMetricTotals(activeCurrentTotals) ||
    hasMetricTotals(activePreviousTotals) ||
    activeTrendRows.length > 0;
  const hasDisplayData = hasActiveScopeFactRows || hasScopeSummaryData;
  const displayCurrentTotals = hasDisplayData
    ? withDerivedCostShare(activeScope, activeCurrentTotals, legacyCurrentTotals)
    : null;
  const displayPreviousTotals = hasDisplayData
    ? withDerivedCostShare(activeScope, activePreviousTotals, legacyPreviousTotals)
    : null;
  const activeScopeLabel = QIANCHUAN_SCOPE_LABELS[activeScope];
  const showMaterialTypeMix = activeScope === 'all';
  const showLiveRoomScreen = activeScope !== 'video';
  const showLiveVideo = activeScope !== 'liveRoomScreen';
  const tableClassNames = useMemo(
    () => mergeTableClassNames(getTableClassNames(), tableClassNamesOverride),
    [tableClassNamesOverride]
  );
  const handleDetailPaginationChange = useCallback(
    (tableKey: QianchuanDetailTableKey, page: number, pageSize: number) => {
      setDetailPagination((current) => {
        const previous = current[tableKey];
        const nextCurrent = previous.pageSize === pageSize ? page : 1;
        if (previous.current === nextCurrent && previous.pageSize === pageSize) return current;

        return {
          ...current,
          [tableKey]: { current: nextCurrent, pageSize },
        };
      });
    },
    []
  );
  const handleScopeChange = useCallback((value: DashboardQianchuanMaterialScopeKey) => {
    setActiveScope(value);
    setDetailPagination(createQianchuanDetailPaginationState());
  }, []);
  const metricCardGroups = useMemo(
    () =>
      buildMetricCardGroups({
        scope: activeScope,
        currentTotals: displayCurrentTotals,
        previousTotals: displayPreviousTotals,
      }),
    [activeScope, displayCurrentTotals, displayPreviousTotals]
  );
  const trendOption = useMemo(
    () =>
      buildDashboardQianchuanTrendOption({
        rows: hasDisplayData ? activeTrendRows : [],
        chartTokens: ECHARTS_CHART_TOKENS,
      }),
    [activeTrendRows, hasDisplayData]
  );
  const materialTypeMixColumns = useMemo(
    () => buildDashboardQianchuanMaterialTypeMixColumns({ isMobile, classNames: tableClassNames }),
    [isMobile, tableClassNames]
  );
  const liveRoomScreenColumns = useMemo(
    () => buildDashboardQianchuanLiveRoomScreenColumns({ isMobile, classNames: tableClassNames }),
    [isMobile, tableClassNames]
  );
  const liveVideoColumns = useMemo(
    () => buildDashboardQianchuanLiveVideoColumns({ isMobile, classNames: tableClassNames }),
    [isMobile, tableClassNames]
  );
  const {
    disableLiveRoomScreenDetailExport,
    disableLiveVideoDetailExport,
    disableMaterialTypeMixDetailExport,
    handleExportLiveRoomScreenDetails,
    handleExportLiveVideoDetails,
    handleExportMaterialTypeMixDetails,
    isExportingLiveRoomScreenDetails,
    isExportingLiveVideoDetails,
    isExportingMaterialTypeMixDetails,
  } = useDashboardQianchuanDetailExportActions({
    currentRange,
    isAuthenticated,
    isLoading,
    liveRoomScreenRows,
    liveVideoRows,
    materialTypeMixRows,
    messageApi,
    responseData,
  });
  const tableEmptyContent = getTableEmptyContent({
    loading: isLoading,
    loadErrorMessage,
    emptyDescription: `当前筛选条件下暂无${activeScopeLabel}数据`,
  });

  return (
    <div className={`${trafficSectionStyles.sectionStack} ${styles.root}`}>
      {loadErrorMessage ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>千川直播全域数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{loadErrorMessage}</span>
          <span className={noticeStyles.overviewDataErrorNoticeText}>
            当前空表可能是接口失败，不代表业务数据为 0。请优先检查 /v1/dashboard/qianchuan 与 ADS 千川事实表刷新状态。
          </span>
        </section>
      ) : null}

      <DashboardMetricCardSection
        header={
          <div className={`${trafficSectionHeaderStyles.head} ${styles.metricScopeHead}`}>
            <div
              className={`${trafficSectionHeaderStyles.meta} ${trafficSectionHeaderStyles.liveScopeMeta} ${styles.metricScopeControl}`}
            >
              <div className={`${trafficSectionControlStyles.liveScopeSwitch} ${styles.scopeSwitch}`}>
                <Segmented<DashboardQianchuanMaterialScopeKey>
                  aria-label="千川内容范围"
                  name="dashboard-qianchuan-material-scope"
                  size="small"
                  value={activeScope}
                  onChange={(value) => handleScopeChange(value as DashboardQianchuanMaterialScopeKey)}
                  options={QIANCHUAN_SCOPE_OPTIONS}
                />
              </div>
            </div>
          </div>
        }
        topCards={metricCardGroups.topCards}
        bottomCards={metricCardGroups.bottomCards}
        bottomCardRows={metricCardGroups.bottomCardRows}
        bottomGridColumnCounts={metricCardGroups.bottomGridColumnCounts}
        trendIdPrefix={`qianchuan-scope-${activeScope}`}
        getTrendClassNameByRate={getTrendClassName}
        miniTrendVariant="dense"
        resolveTopHeading={(item) => ({
          title: item.label,
          subtitle:
            item.key === 'overall_cost'
              ? '投放花费'
              : item.key === 'overall_gmv'
                ? '成交金额'
                : item.key === 'overall_cost_share'
                  ? '范围消耗 / 总消耗'
                  : item.key === 'net_gmv_roi'
                    ? '净成交金额 / 消耗'
                  : '成交金额 / 消耗',
        })}
      />

      {!hasDisplayData && !isLoading && !loadErrorMessage ? (
        <section className={`${styles.panel} ${styles.emptyPanel}`}>
          <Empty description="当前筛选条件下暂无千川看板数据" />
        </section>
      ) : null}

      <DashboardChart
        title={getTrendTitle(activeScope)}
        option={trendOption}
        className={`${chartStyles.widePanel} ${styles.trendPanel}`}
      />

      {showMaterialTypeMix ? (
        <section className={`${styles.panel} ${styles.sectionPanel}`}>
          {renderSectionHead({
            title: '视频 / 直播间画面对比',
            description: '比较两类千川投放内容的消耗、GMV、订单和 ROI 贡献。',
            meta: `${materialTypeMixRows.length} 类`,
            actions: (
              <Button
                type="primary"
                size="small"
                icon={<DownloadOutlined />}
                loading={isExportingMaterialTypeMixDetails}
                disabled={disableMaterialTypeMixDetailExport}
                onClick={handleExportMaterialTypeMixDetails}
              >
                导出明细
              </Button>
            ),
          })}
          {renderDataTable<DashboardQianchuanMaterialTypeMixRow>({
            rows: materialTypeMixRows,
            loading: isLoading,
            columns: materialTypeMixColumns,
            emptyText: tableEmptyContent,
            rowKey: (row, index) =>
              getMaterialType(row) ||
              readText(row, ['materialTypeLabel', 'material_type_label']) ||
              `material-type-mix-row-${index ?? 0}`,
            isMobile,
            scrollX: 'max-content',
            paginationState: detailPagination.materialTypeMix,
            onPaginationChange: (page, pageSize) => handleDetailPaginationChange('materialTypeMix', page, pageSize),
          })}
        </section>
      ) : null}

      {showLiveVideo ? (
        <section className={`${styles.panel} ${styles.sectionPanel}`}>
          {renderSectionHead({
            title: '视频',
            description: '按素材 ID、视频类型、直播间与创建时间下钻播放、互动和成交指标。',
            meta: `${liveVideoRows.length} 条`,
            actions: (
              <Button
                type="primary"
                size="small"
                icon={<DownloadOutlined />}
                loading={isExportingLiveVideoDetails}
                disabled={disableLiveVideoDetailExport}
                onClick={handleExportLiveVideoDetails}
              >
                导出明细
              </Button>
            ),
          })}
          {renderDataTable<DashboardQianchuanLiveVideoRow>({
            rows: liveVideoRows,
            loading: isLoading,
            columns: liveVideoColumns,
            emptyText: tableEmptyContent,
            rowKey: getLiveVideoRowKey,
            isMobile,
            scrollX: 'max-content',
            paginationState: detailPagination.liveVideo,
            onPaginationChange: (page, pageSize) => handleDetailPaginationChange('liveVideo', page, pageSize),
          })}
        </section>
      ) : null}

      {showLiveRoomScreen ? (
        <section className={`${styles.panel} ${styles.sectionPanel}`}>
          {renderSectionHead({
            title: '直播间画面',
            description: '按账号、投放类型与画面 Key 下钻直播互动指标。',
            meta: `${liveRoomScreenRows.length} 条`,
            actions: (
              <Button
                type="primary"
                size="small"
                icon={<DownloadOutlined />}
                loading={isExportingLiveRoomScreenDetails}
                disabled={disableLiveRoomScreenDetailExport}
                onClick={handleExportLiveRoomScreenDetails}
              >
                导出明细
              </Button>
            ),
          })}
          {renderDataTable<DashboardQianchuanLiveRoomScreenRow>({
            rows: liveRoomScreenRows,
            loading: isLoading,
            columns: liveRoomScreenColumns,
            emptyText: tableEmptyContent,
            rowKey: getLiveRoomRowKey,
            isMobile,
            scrollX: 'max-content',
            paginationState: detailPagination.liveRoomScreen,
            onPaginationChange: (page, pageSize) => handleDetailPaginationChange('liveRoomScreen', page, pageSize),
          })}
        </section>
      ) : null}
    </div>
  );
}
