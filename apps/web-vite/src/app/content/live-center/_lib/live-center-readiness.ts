import { formatInteger } from './live-center-formatters';
import { isLiveCenterRecordingSegmentPlayable } from './live-center-recording-segment-helpers';
import type {
  LiveCenterSession,
  LiveCenterSessionDetailResponse,
} from './live-center-types';

export type ReadinessTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface ReadinessItem {
  label: string;
  status: string;
  detail: string;
  tone: ReadinessTone;
}

export interface RecordingSegmentStats {
  totalCount: number | null;
  uploadedCount: number | null;
  cleanupCount: number | null;
  displayCount: number | null;
  displayLabel: string;
}

export function resolveReadinessItems(
  session: LiveCenterSession,
  detail: LiveCenterSessionDetailResponse | undefined,
  recordingSegmentStats: RecordingSegmentStats
): ReadinessItem[] {
  const minutePointCount = detail?.minuteMetrics.length ?? session.minutePointCount;
  const minuteOrderCount = detail
    ? detail.minuteMetrics.reduce((total, metric) => total + (metric.orderCount ?? 0), 0)
    : session.minuteOrderCount;
  const hasLiveOrders = typeof session.liveOrderCount === 'number' && session.liveOrderCount > 0;
  const hasMinuteGap =
    hasLiveOrders && typeof minutePointCount === 'number' && minutePointCount <= 0;
  const hasOrderDifference =
    hasLiveOrders
    && typeof minuteOrderCount === 'number'
    && minuteOrderCount > 0
    && minuteOrderCount !== session.liveOrderCount;

  return [
    resolveRecordingReadiness(recordingSegmentStats),
    resolveMinuteReadiness(
      minutePointCount,
      session.liveOrderCount,
      minuteOrderCount,
      hasMinuteGap,
      hasOrderDifference
    ),
  ];
}

export function resolveRecordingSegmentStats(
  session: LiveCenterSession,
  detail?: LiveCenterSessionDetailResponse
): RecordingSegmentStats {
  const segments = detail?.recording?.segments;
  if (!segments) {
    return {
      cleanupCount: null,
      displayCount: session.recordingSegmentCount,
      displayLabel: '录屏',
      totalCount: session.recordingSegmentCount,
      uploadedCount: null,
    };
  }

  const uploadedCount = segments.filter(isLiveCenterRecordingSegmentPlayable).length;
  return {
    cleanupCount: segments.length - uploadedCount,
    displayCount: uploadedCount,
    displayLabel: '可播放',
    totalCount: segments.length,
    uploadedCount,
  };
}

function resolveRecordingReadiness(stats: RecordingSegmentStats): ReadinessItem {
  if (typeof stats.totalCount !== 'number') {
    return {
      detail: '等待录屏记录同步后，再判断是否需要补上传。',
      label: '录屏',
      status: '未知',
      tone: 'neutral',
    };
  }
  if (stats.totalCount <= 0) {
    return {
      detail: '先上传至少 1 段录屏，才能把成交波峰落到具体片段。',
      label: '录屏',
      status: '待补',
      tone: 'warning',
    };
  }
  if (typeof stats.uploadedCount === 'number' && stats.uploadedCount <= 0) {
    return {
      detail: '当前只有未完成录屏分段；请先清理残留或重新上传完成分段。',
      label: '录屏',
      status: `待清理 ${formatInteger(stats.cleanupCount)} 段`,
      tone: 'warning',
    };
  }
  if (typeof stats.cleanupCount === 'number' && stats.cleanupCount > 0) {
    return {
      detail: '已有可播放分段，但仍有未完成分段待清理。',
      label: '录屏',
      status: `${formatInteger(stats.uploadedCount)} 可播 / ${formatInteger(stats.cleanupCount)} 待清理`,
      tone: 'warning',
    };
  }
  return {
    detail: '已具备可播放片段，可按分钟线定位复盘。',
    label: '录屏',
    status: `${formatInteger(stats.displayCount)} 段`,
    tone: 'success',
  };
}

function resolveMinuteReadiness(
  pointCount: number | null,
  liveOrderCount: number | null,
  minuteOrderCount: number | null,
  hasMinuteGap: boolean,
  hasOrderDifference: boolean
): ReadinessItem {
  if (hasMinuteGap) {
    return {
      detail: `已有 ${formatInteger(liveOrderCount)} 单，但暂无分钟点；先复核分钟指标刷新或场次匹配。`,
      label: '分钟',
      status: '需复核',
      tone: 'warning',
    };
  }
  if (hasOrderDifference && typeof minuteOrderCount === 'number' && typeof liveOrderCount === 'number') {
    const orderGap = liveOrderCount - minuteOrderCount;
    return {
      detail: `场次汇总 ${formatInteger(liveOrderCount)} 单，分钟明细 ${formatInteger(minuteOrderCount)} 单，源头差异 ${formatInteger(Math.abs(orderGap))} 单。`,
      label: '分钟',
      status: `差异 ${formatInteger(Math.abs(orderGap))} 单`,
      tone: 'info',
    };
  }
  if (typeof pointCount !== 'number') {
    return {
      detail: '等待分钟指标同步后，再判断成交峰值。',
      label: '分钟',
      status: '未知',
      tone: 'neutral',
    };
  }
  if (pointCount <= 0) {
    return {
      detail: '当前未返回可绘制分钟点；若该场次无成交，可保留为空。',
      label: '分钟',
      status: '暂无点位',
      tone: 'neutral',
    };
  }
  return {
    detail: '已具备分钟级成交证据，可用于定位录屏片段。',
    label: '分钟',
    status: `${formatInteger(pointCount)} 点`,
    tone: 'success',
  };
}
