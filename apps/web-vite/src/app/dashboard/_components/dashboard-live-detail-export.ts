import dayjs from 'dayjs';
import {
  escapeCsvCell,
  formatCsvInteger,
  formatCsvNumber,
  formatCsvRate,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { getLiveDetailGsv } from './dashboard-live-detail-formatters';
import { formatLiveGoodsAnchorType } from './dashboard-live-goods-formatters';
import { LIVE_DETAIL_METRIC_DEFINITIONS } from './dashboard-metric-definitions';
import type {
  DashboardLiveDetailRow,
  LiveDetailMetricDefinition,
  LiveScope,
} from './dashboard-types';

const LIVE_DETAIL_EXPORT_BASE_HEADERS = ['直播开始时间', '主播昵称', '主播抖音号', '主播类型'];
const LIVE_DETAIL_EXPORT_GSV_HEADER = '直播间GSV';

function formatLiveDetailExportMetricValue(
  row: DashboardLiveDetailRow,
  metric: LiveDetailMetricDefinition
): string {
  const value = row[metric.key] as NumericInput;

  if (metric.format === 'rate') {
    return formatCsvRate(value);
  }
  if (metric.format === 'integer') {
    return formatCsvInteger(value);
  }
  return formatCsvNumber(value, metric.digits ?? 2);
}

function buildLiveDetailExportMetricValues(row: DashboardLiveDetailRow): string[] {
  const values: string[] = [];

  for (const metric of LIVE_DETAIL_METRIC_DEFINITIONS) {
    values.push(formatLiveDetailExportMetricValue(row, metric));
    if (metric.key === 'live_gmv') {
      values.push(formatCsvNumber(getLiveDetailGsv(row), 2));
    }
  }

  return values;
}

function buildLiveDetailExportMetricHeaders(): string[] {
  const headers: string[] = [];

  for (const metric of LIVE_DETAIL_METRIC_DEFINITIONS) {
    headers.push(metric.title);
    if (metric.key === 'live_gmv') {
      headers.push(LIVE_DETAIL_EXPORT_GSV_HEADER);
    }
  }

  return headers;
}

function buildLiveDetailExportRow(row: DashboardLiveDetailRow): string {
  const liveStartTime = dayjs(row.live_start_time).isValid()
    ? dayjs(row.live_start_time).format('YYYY-MM-DD HH:mm')
    : row.live_start_time || '';
  const metricValues = buildLiveDetailExportMetricValues(row);

  return [
    liveStartTime,
    row.anchor_nickname || '',
    row.anchor_douyin_id || '',
    formatLiveGoodsAnchorType(row.anchor_type),
    ...metricValues,
  ]
    .map((cell) => escapeCsvCell(cell))
    .join(',');
}

export function buildDashboardLiveDetailCsvExport({
  rows,
  liveScope,
  startDate,
  endDate,
}: {
  rows: DashboardLiveDetailRow[];
  liveScope: LiveScope;
  startDate: string;
  endDate: string;
}): { csvText: string; fileName: string } {
  const headers = [
    ...LIVE_DETAIL_EXPORT_BASE_HEADERS,
    ...buildLiveDetailExportMetricHeaders(),
  ];
  const csvRows = rows.map((row) => buildLiveDetailExportRow(row));
  const csvText = ['\uFEFF' + headers.join(','), ...csvRows].join('\n');
  const fileName = `dashboard-live-details-${liveScope}-${startDate}_to_${endDate}-${dayjs().format(
    'YYYYMMDD-HHmmss'
  )}.csv`;

  return { csvText, fileName };
}
