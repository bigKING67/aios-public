import dayjs from 'dayjs';
import {
  escapeCsvCell,
  formatCsvInteger,
  formatCsvNumber,
} from './dashboard-formatters';
import type {
  DashboardShortVideoDetailRow,
  ShortVideoScope,
} from './dashboard-types';

const SHORT_VIDEO_DETAIL_EXPORT_HEADERS = [
  '日期',
  '达人昵称',
  '抖音号',
  '达人类型',
  '视频标题',
  '发布时间',
  '视频ID',
  '是否投放',
  '播放链接',
  '带货商品ID',
  '视频观看次数',
  '用户支付金额(元)',
  '退款金额(元)',
  '引流直播间用户支付金额(元)',
  '看后搜用户支付金额(元)',
  '引流店铺页用户支付金额(元)',
];

function formatShortVideoExportDate(value: string | null | undefined, outputFormat: string): string {
  if (!value) {
    return '';
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(outputFormat) : value;
}

function buildShortVideoDetailExportRow(row: DashboardShortVideoDetailRow): string {
  const statDate = formatShortVideoExportDate(row.stat_date, 'YYYY-MM-DD');
  const publishTime = formatShortVideoExportDate(row.publish_time, 'YYYY-MM-DD HH:mm');

  return [
    statDate,
    row.author_nickname || '',
    row.author_douyin_id || '',
    row.account_type || '',
    row.video_title || '',
    publishTime,
    row.video_id || '',
    row.is_promoted || '',
    row.play_url || '',
    row.product_id || '',
    formatCsvInteger(row.video_view_count),
    formatCsvNumber(row.user_pay_amount, 2),
    formatCsvNumber(row.refund_amount, 2),
    formatCsvNumber(row.live_room_pay_amount, 2),
    formatCsvNumber(row.search_after_view_pay_amount, 2),
    formatCsvNumber(row.shop_page_pay_amount, 2),
  ]
    .map((cell) => escapeCsvCell(cell))
    .join(',');
}

export function buildDashboardShortVideoDetailCsvExport({
  rows,
  shortVideoScope,
  startDate,
  endDate,
}: {
  rows: DashboardShortVideoDetailRow[];
  shortVideoScope: ShortVideoScope;
  startDate: string;
  endDate: string;
}): { csvText: string; fileName: string } {
  const csvRows = rows.map((row) => buildShortVideoDetailExportRow(row));
  const csvText = ['\uFEFF' + SHORT_VIDEO_DETAIL_EXPORT_HEADERS.join(','), ...csvRows].join('\n');
  const fileName = `dashboard-shortvideo-details-${shortVideoScope}-${startDate}_to_${endDate}-${dayjs().format(
    'YYYYMMDD-HHmmss'
  )}.csv`;

  return { csvText, fileName };
}
