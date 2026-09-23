import dayjs from 'dayjs';

import {
  escapeCsvCell,
  formatCsvInteger,
  formatCsvNumber,
  formatCsvRate,
} from './dashboard-formatters';
import type {
  DashboardQianchuanLiveRoomScreenRow,
  DashboardQianchuanLiveVideoRow,
  DashboardQianchuanMaterialTypeMixRow,
} from './dashboard-qianchuan-types';

type QianchuanDetailExportFormat =
  | 'currency'
  | 'datetime'
  | 'duration'
  | 'integer'
  | 'number'
  | 'rate'
  | 'text';

type QianchuanDetailExportColumn = {
  header: string;
  keys: string[];
  format: QianchuanDetailExportFormat;
};

type QianchuanDetailExportRow =
  | DashboardQianchuanLiveRoomScreenRow
  | DashboardQianchuanLiveVideoRow
  | DashboardQianchuanMaterialTypeMixRow;

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  live_room_screen: '直播间画面',
  live_video: '视频',
};
const LEGACY_MATERIAL_SUFFIX = '素材';
const LEGACY_LIVE_VIDEO_LABEL_PATTERN = new RegExp(
  `${MATERIAL_TYPE_LABELS.live_video}${LEGACY_MATERIAL_SUFFIX}`,
  'gu'
);

const QIANCHUAN_SHARED_METRIC_DETAIL_EXPORT_COLUMNS: QianchuanDetailExportColumn[] = [
  { header: '消耗(元)', keys: ['overallCost', 'overall_cost', 'costAmount', 'cost_amount'], format: 'currency' },
  { header: 'GMV(元)', keys: ['overallGmv', 'overall_gmv'], format: 'currency' },
  { header: '净GMV(元)', keys: ['netGmv', 'net_gmv'], format: 'currency' },
  { header: '订单数', keys: ['overallOrderCount', 'overall_order_count', 'orderCount', 'order_count'], format: 'integer' },
  { header: '展现数', keys: ['overallImpressionCount', 'overall_impression_count', 'impressionCount', 'impression_count'], format: 'integer' },
  { header: '点击数', keys: ['overallClickCount', 'overall_click_count', 'clickCount', 'click_count'], format: 'integer' },
  { header: '支付ROI', keys: ['overallPayRoi', 'overall_pay_roi', 'payRoi', 'pay_roi'], format: 'number' },
  { header: '净GMV ROI', keys: ['netGmvRoi', 'net_gmv_roi'], format: 'number' },
  { header: '净成交成本(元)', keys: ['netOrderCost', 'net_order_cost'], format: 'currency' },
  { header: '点击率', keys: ['overallClickRate', 'overall_click_rate', 'clickRate', 'click_rate'], format: 'rate' },
  { header: '转化率', keys: ['overallConversionRate', 'overall_conversion_rate', 'conversionRate', 'conversion_rate'], format: 'rate' },
  { header: '1h退款率', keys: ['refundRate1h', 'refund_rate_1h'], format: 'rate' },
  { header: '7日结算ROI', keys: ['settlementRoi7d', 'settlement_roi_7d'], format: 'number' },
  { header: '14日结算ROI', keys: ['settlementRoi14d', 'settlement_roi_14d'], format: 'number' },
  { header: '30日结算ROI', keys: ['settlementRoi30d', 'settlement_roi_30d'], format: 'number' },
  { header: 'CPM', keys: ['overallCpm', 'overall_cpm'], format: 'currency' },
  { header: '成本占比', keys: ['overallCostRatio', 'overall_cost_ratio'], format: 'rate' },
];

const QIANCHUAN_MATERIAL_TYPE_MIX_DETAIL_EXPORT_COLUMNS: QianchuanDetailExportColumn[] = [
  { header: '内容类型', keys: ['materialTypeLabel', 'material_type_label', 'materialType', 'material_type'], format: 'text' },
  { header: '内容数', keys: ['materialCount', 'material_count'], format: 'integer' },
  ...QIANCHUAN_SHARED_METRIC_DETAIL_EXPORT_COLUMNS,
  { header: '消耗占比', keys: ['overallCostShare', 'overall_cost_share', 'costShare', 'cost_share'], format: 'rate' },
  { header: 'GMV占比', keys: ['overallGmvShare', 'overall_gmv_share', 'gmvShare', 'gmv_share'], format: 'rate' },
];

const QIANCHUAN_LIVE_VIDEO_DETAIL_EXPORT_COLUMNS: QianchuanDetailExportColumn[] = [
  { header: '视频', keys: ['materialVideoName', 'material_video_name', 'materialName', 'material_name', 'videoName', 'video_name', 'videoTitle', 'video_title'], format: 'text' },
  { header: '素材ID', keys: ['materialId', 'material_id', 'videoId', 'video_id'], format: 'text' },
  { header: '视频类型', keys: ['globalMaterialVideoType', 'global_material_video_type'], format: 'text' },
  { header: '直播间', keys: ['liveRoomName', 'live_room_name'], format: 'text' },
  { header: '直播间抖音号', keys: ['douyinAccountDisplayId', 'douyin_account_display_id'], format: 'text' },
  { header: '视频创建时间', keys: ['materialCreatedAt', 'material_created_at'], format: 'datetime' },
  ...QIANCHUAN_SHARED_METRIC_DETAIL_EXPORT_COLUMNS,
  { header: '播放次数', keys: ['videoPlayCount', 'video_play_count', 'playCount', 'play_count'], format: 'integer' },
  { header: '完播率', keys: ['videoCompletePlayRate', 'video_complete_play_rate'], format: 'rate' },
  { header: '2s播放率', keys: ['playRate2s', 'play_rate_2s'], format: 'rate' },
  { header: '3s播放率', keys: ['playRate3s', 'play_rate_3s'], format: 'rate' },
  { header: '5s播放率', keys: ['playRate5s', 'play_rate_5s'], format: 'rate' },
  { header: '10s播放率', keys: ['playRate10s', 'play_rate_10s'], format: 'rate' },
  { header: '平均观看时长(秒)', keys: ['avgWatchDuration', 'avg_watch_duration'], format: 'duration' },
  { header: '视频点赞数', keys: ['videoLikeCount', 'video_like_count'], format: 'integer' },
  { header: '视频评论数', keys: ['videoCommentCount', 'video_comment_count'], format: 'integer' },
  { header: '新增粉丝', keys: ['newFansCount', 'new_fans_count'], format: 'integer' },
];

const QIANCHUAN_LIVE_ROOM_SCREEN_DETAIL_EXPORT_COLUMNS: QianchuanDetailExportColumn[] = [
  { header: '抖音账号', keys: ['douyinAccountName', 'douyin_account_name', 'accountName', 'account_name'], format: 'text' },
  { header: '抖音号', keys: ['douyinAccountDisplayId', 'douyin_account_display_id'], format: 'text' },
  { header: '投放类型', keys: ['promotionType', 'promotion_type'], format: 'text' },
  { header: '画面Key', keys: ['materialKey', 'material_key'], format: 'text' },
  ...QIANCHUAN_SHARED_METRIC_DETAIL_EXPORT_COLUMNS,
  { header: '直播评论数', keys: ['liveCommentCount', 'live_comment_count'], format: 'integer' },
  { header: '直播点赞数', keys: ['liveLikeCount', 'live_like_count'], format: 'integer' },
  { header: '新增粉丝', keys: ['newFansCount', 'new_fans_count'], format: 'integer' },
];

function readValue(row: QianchuanDetailExportRow, keys: string[]): unknown {
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
}

function formatText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value).trim();
  return (MATERIAL_TYPE_LABELS[text] ?? text).replace(LEGACY_LIVE_VIDEO_LABEL_PATTERN, MATERIAL_TYPE_LABELS.live_video);
}

function formatDateTime(value: unknown): string {
  const text = formatText(value);
  if (!text) {
    return '';
  }

  const parsed = dayjs(text);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : text;
}

function formatExportValue(value: unknown, format: QianchuanDetailExportFormat): string {
  if (format === 'datetime') {
    return formatDateTime(value);
  }
  if (format === 'integer') {
    return formatCsvInteger(value as string | number | null);
  }
  if (format === 'rate') {
    return formatCsvRate(value as string | number | null);
  }
  if (format === 'duration') {
    return formatCsvNumber(value as string | number | null, 1);
  }
  if (format === 'currency' || format === 'number') {
    return formatCsvNumber(value as string | number | null, 2);
  }
  return formatText(value);
}

function buildQianchuanMaterialTypeMixDetailExportRow(row: DashboardQianchuanMaterialTypeMixRow): string {
  return QIANCHUAN_MATERIAL_TYPE_MIX_DETAIL_EXPORT_COLUMNS.map((column) =>
    escapeCsvCell(formatExportValue(readValue(row, column.keys), column.format))
  ).join(',');
}

function buildQianchuanLiveVideoDetailExportRow(row: DashboardQianchuanLiveVideoRow): string {
  return QIANCHUAN_LIVE_VIDEO_DETAIL_EXPORT_COLUMNS.map((column) =>
    escapeCsvCell(formatExportValue(readValue(row, column.keys), column.format))
  ).join(',');
}

function buildQianchuanLiveRoomScreenDetailExportRow(row: DashboardQianchuanLiveRoomScreenRow): string {
  return QIANCHUAN_LIVE_ROOM_SCREEN_DETAIL_EXPORT_COLUMNS.map((column) =>
    escapeCsvCell(formatExportValue(readValue(row, column.keys), column.format))
  ).join(',');
}

export function buildDashboardQianchuanMaterialTypeMixDetailCsvExport({
  rows,
  startDate,
  endDate,
}: {
  rows: DashboardQianchuanMaterialTypeMixRow[];
  startDate: string;
  endDate: string;
}): { csvText: string; fileName: string } {
  const csvRows = rows.map((row) => buildQianchuanMaterialTypeMixDetailExportRow(row));
  const headers = QIANCHUAN_MATERIAL_TYPE_MIX_DETAIL_EXPORT_COLUMNS.map((column) => column.header);
  const csvText = ['\uFEFF' + headers.join(','), ...csvRows].join('\n');
  const fileName = `dashboard-qianchuan-material-type-mix-details-${startDate}_to_${endDate}-${dayjs().format(
    'YYYYMMDD-HHmmss'
  )}.csv`;

  return { csvText, fileName };
}

export function buildDashboardQianchuanLiveVideoDetailCsvExport({
  rows,
  startDate,
  endDate,
}: {
  rows: DashboardQianchuanLiveVideoRow[];
  startDate: string;
  endDate: string;
}): { csvText: string; fileName: string } {
  const csvRows = rows.map((row) => buildQianchuanLiveVideoDetailExportRow(row));
  const headers = QIANCHUAN_LIVE_VIDEO_DETAIL_EXPORT_COLUMNS.map((column) => column.header);
  const csvText = ['\uFEFF' + headers.join(','), ...csvRows].join('\n');
  const fileName = `dashboard-qianchuan-video-details-${startDate}_to_${endDate}-${dayjs().format(
    'YYYYMMDD-HHmmss'
  )}.csv`;

  return { csvText, fileName };
}

export function buildDashboardQianchuanLiveRoomScreenDetailCsvExport({
  rows,
  startDate,
  endDate,
}: {
  rows: DashboardQianchuanLiveRoomScreenRow[];
  startDate: string;
  endDate: string;
}): { csvText: string; fileName: string } {
  const csvRows = rows.map((row) => buildQianchuanLiveRoomScreenDetailExportRow(row));
  const headers = QIANCHUAN_LIVE_ROOM_SCREEN_DETAIL_EXPORT_COLUMNS.map((column) => column.header);
  const csvText = ['\uFEFF' + headers.join(','), ...csvRows].join('\n');
  const fileName = `dashboard-qianchuan-live-room-screen-details-${startDate}_to_${endDate}-${dayjs().format(
    'YYYYMMDD-HHmmss'
  )}.csv`;

  return { csvText, fileName };
}
