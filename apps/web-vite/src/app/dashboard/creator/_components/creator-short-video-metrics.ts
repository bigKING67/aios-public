import dayjs from 'dayjs';
import type { DateRange } from './creator-date-range';
import {
  calculateCreatorGsv,
  toNumber,
} from './creator-formatters';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';

export function normalizeShortVideoMetricKey(value: string | null | undefined): string {
  return value?.trim() || '';
}

export function resolveShortVideoMetricVideoId(row: CreatorShortVideoDetailRow): string {
  return normalizeShortVideoMetricKey(row.video_id);
}

export function resolveShortVideoMetricEntityKey(row: CreatorShortVideoDetailRow): string {
  const videoId = resolveShortVideoMetricVideoId(row);
  return videoId ? `video:${videoId}` : '';
}

export function resolveShortVideoCooperationFeeKey(row: CreatorShortVideoDetailRow): string | null {
  const authorDouyinId = normalizeShortVideoMetricKey(row.author_douyin_id);
  const videoId = normalizeShortVideoMetricKey(row.video_id);

  if (!authorDouyinId || !videoId) {
    return null;
  }

  return `author:${authorDouyinId}|video:${videoId}`;
}

export function isShortVideoVideoScopedManualAttr(row: CreatorShortVideoDetailRow): boolean {
  const manualScopeType = normalizeShortVideoMetricKey(row.manual_scope_type);
  const manualVideoId = normalizeShortVideoMetricKey(row.manual_video_id);
  const videoId = normalizeShortVideoMetricKey(row.video_id);

  return manualScopeType === 'video' && Boolean(videoId) && manualVideoId === videoId;
}

export function resolveShortVideoManualCreatorFeeAmount(row: CreatorShortVideoDetailRow): number {
  if (!isShortVideoVideoScopedManualAttr(row)) {
    return 0;
  }

  return toNumber(row.manual_creator_fee_amount);
}

export function hasShortVideoCartSaleAmount(row: CreatorShortVideoDetailRow): boolean {
  return (
    toNumber(row.user_pay_amount) > 0 ||
    toNumber(row.shortvideo_gmv) > 0 ||
    toNumber(row.shortvideo_user_pay_amount) > 0
  );
}

export function hasShortVideoQianchuanGmv(row: CreatorShortVideoDetailRow): boolean {
  return resolveShortVideoQianchuanGmv(row) > 0;
}

export function hasShortVideoOrderSignal(row: CreatorShortVideoDetailRow): boolean {
  return hasShortVideoQianchuanGmv(row) || hasShortVideoCartSaleAmount(row);
}

export function isShortVideoPublishedInRange(row: CreatorShortVideoDetailRow, range: DateRange): boolean {
  const publishTime = normalizeShortVideoMetricKey(row.publish_time);
  return isShortVideoDateValueInRange(publishTime, range);
}

function isShortVideoDateValueInRange(dateValue: string, range: DateRange): boolean {
  if (!dateValue) {
    return false;
  }

  const publishDate = dayjs(dateValue);
  return (
    publishDate.isValid() &&
    !publishDate.isBefore(range.start, 'day') &&
    !publishDate.isAfter(range.end, 'day')
  );
}

export function isShortVideoMetricEntityNewInRange(row: CreatorShortVideoDetailRow, range: DateRange): boolean {
  return Boolean(resolveShortVideoMetricVideoId(row)) && isShortVideoPublishedInRange(row, range);
}

export function resolveShortVideoTrafficRevenue(row: CreatorShortVideoDetailRow): number {
  return resolveShortVideoQianchuanGmv(row);
}

export function resolveShortVideoQianchuanGmv(row: CreatorShortVideoDetailRow): number {
  return toNumber(row.qianchuan_overall_gmv);
}

export function resolveShortVideoQianchuanGsv(row: CreatorShortVideoDetailRow): number {
  return toNumber(row.qianchuan_net_gmv);
}

export function resolveShortVideoCartRevenue(row: CreatorShortVideoDetailRow): number {
  return toNumber(row.user_pay_amount);
}

export function resolveShortVideoGmv(row: CreatorShortVideoDetailRow): number {
  return toNumber(row.user_pay_amount);
}

export function resolveShortVideoRefundAmount(row: CreatorShortVideoDetailRow): number {
  return toNumber(row.refund_amount);
}

export function resolveShortVideoGsv(row: CreatorShortVideoDetailRow): number {
  return calculateCreatorGsv(row.user_pay_amount, row.refund_amount);
}

export function resolveShortVideoAdCost(row: CreatorShortVideoDetailRow): number {
  return toNumber(row.qianchuan_overall_cost);
}

export function resolveShortVideoOrderCount(row: CreatorShortVideoDetailRow): number {
  return toNumber(row.qianchuan_overall_order_count);
}

export function resolveShortVideoTrafficRoi(row: CreatorShortVideoDetailRow): number | null {
  return resolveShortVideoQianchuanRoi(row);
}

export function resolveShortVideoQianchuanRoi(row: CreatorShortVideoDetailRow): number | null {
  const adCost = resolveShortVideoAdCost(row);
  if (adCost <= 0) {
    return null;
  }

  return resolveShortVideoQianchuanGmv(row) / adCost;
}

export function resolveShortVideoCartRoi(row: CreatorShortVideoDetailRow): number | null {
  const totalCost =
    resolveShortVideoAdCost(row) +
    resolveShortVideoManualCreatorFeeAmount(row);
  if (totalCost <= 0) {
    return null;
  }

  return resolveShortVideoCartRevenue(row) / totalCost;
}

export function formatShortVideoRoi(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '--' : value.toFixed(2);
}
