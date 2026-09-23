import dayjs from 'dayjs';
import type { QueryPlatform } from './dashboard-config';
import {
  escapeCsvCell,
  formatCsvInteger,
  formatCsvNumber,
  formatCsvRate,
} from './dashboard-formatters';
import {
  getNowcastQualityStatusLabel,
  getPredictionConfidenceLabel,
} from './dashboard-overview-labels';
import type { DashboardOverviewDetailRow } from './dashboard-types';

const OVERVIEW_DETAIL_EXPORT_HEADERS = [
  '日期',
  '平台',
  'GMV',
  '用户支付金额',
  'GSV（支付时间）',
  'GSV（退款时间）',
  '订单量',
  '成交人数',
  '客单价',
  '当前退款金额（支付时间）',
  '预测全部退款金额（支付时间）',
  '退款金额（退款时间）',
  '退款率（支付时间）',
  '预测退款率（支付时间）',
  '退款率（退款时间）',
  '消耗',
  '付费GMV',
  'ROI',
  '付费ROI',
  '预测完备率',
  '预测置信度',
  '预测质量状态',
];

function buildOverviewDetailExportRow(row: DashboardOverviewDetailRow): string {
  return [
    row.date,
    row.platform,
    formatCsvNumber(row.gmv, 2),
    formatCsvNumber(row.user_pay_amount, 2),
    formatCsvNumber(row.gsv_pay_time_current, 2),
    formatCsvNumber(row.gsv_refund_time, 2),
    formatCsvNumber(row.order_count),
    formatCsvNumber(row.buyer_count),
    formatCsvInteger(row.arpu),
    formatCsvNumber(row.refund_amount_pay_time_current, 2),
    formatCsvNumber(row.refund_amount_pay_time_predicted, 2),
    formatCsvNumber(row.refund_amount_refund_time, 2),
    formatCsvRate(row.refund_rate_pay_time_current),
    formatCsvRate(row.refund_rate_pay_time_predicted),
    formatCsvRate(row.refund_rate_refund_time),
    formatCsvNumber(row.cost, 2),
    formatCsvNumber(row.gmv_from_cost, 2),
    formatCsvNumber(row.roi, 4),
    formatCsvNumber(row.roi_from_cost, 4),
    formatCsvRate(row.completeness_ratio),
    getPredictionConfidenceLabel(row.prediction_confidence),
    getNowcastQualityStatusLabel(row.quality_status),
  ]
    .map((cell) => escapeCsvCell(cell))
    .join(',');
}

export function buildDashboardOverviewDetailCsvExport({
  rows,
  platform,
  startDate,
  endDate,
}: {
  rows: DashboardOverviewDetailRow[];
  platform: QueryPlatform;
  startDate: string;
  endDate: string;
}): { csvText: string; fileName: string } {
  const csvRows = rows.map((row) => buildOverviewDetailExportRow(row));
  const csvText = ['\uFEFF' + OVERVIEW_DETAIL_EXPORT_HEADERS.join(','), ...csvRows].join('\n');
  const platformToken = platform === 'overview' ? 'all' : platform;
  const fileName = `dashboard-overview-details-${platformToken}-${startDate}_to_${endDate}-${dayjs().format(
    'YYYYMMDD-HHmmss'
  )}.csv`;

  return { csvText, fileName };
}
