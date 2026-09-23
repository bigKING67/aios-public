import type { LiveCenterAnalysisTimeAnchor } from '../_lib/live-center-view-helpers';

export function resolveVisibleSectionItems<T>(items: T[], limit: number, expanded: boolean): T[] {
  return expanded ? items : items.slice(0, limit);
}

export function buildTimeAnchorPlaybackKey(
  anchor: LiveCenterAnalysisTimeAnchor,
  sourceLabel: string
): string {
  return [
    anchor.segmentIndex ?? (anchor.displaySegmentIndex !== null ? `display:${anchor.displaySegmentIndex}` : 'unknown-segment'),
    anchor.offsetStartSeconds !== null
      ? `start:${anchor.offsetStartSeconds}`
      : anchor.offsetEndSeconds !== null
        ? `end:${anchor.offsetEndSeconds}`
        : anchor.offsetRange ?? anchor.clockTimeRange ?? 'unknown-offset',
    sourceLabel.trim() || 'unknown-source',
  ].join(':');
}

export function formatTimeAnchor(anchor: {
  clockTimeRange: string | null;
  displayTimeRange: string | null;
  minuteRangeLabel: string | null;
  offsetRange: string | null;
  segmentLabel: string | null;
}): string | null {
  return anchor.displayTimeRange || [
    anchor.clockTimeRange || anchor.offsetRange,
    anchor.minuteRangeLabel,
    anchor.segmentLabel,
  ].filter(Boolean).join('｜') || null;
}

export function formatReaderTimeAnchor(anchor: {
  clockTimeRange: string | null;
  displayTimeRange: string | null;
  minuteRangeLabel: string | null;
  offsetRange: string | null;
  segmentLabel: string | null;
}): string | null {
  const segmentLabel = formatReaderSegmentLabel(anchor.segmentLabel);
  const composed = [
    anchor.clockTimeRange || anchor.offsetRange,
    anchor.minuteRangeLabel,
    segmentLabel,
  ].filter(Boolean).join('｜');
  if (composed) {
    return composed;
  }
  return sanitizeReaderTimeText(anchor.displayTimeRange);
}

function formatReaderSegmentLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value
    .replace(/\s*\/\s*slice\s*\d+/gi, '')
    .replace(/\bslice\s*[:#-]?\s*\d+\b/gi, '')
    .replace(/\bsegment\s*[:#-]?\s*(\d+)\b/gi, '录屏 #$1')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

function sanitizeReaderTimeText(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const sanitized = value
    .replace(/\s*\/\s*slice\s*\d+/gi, '')
    .replace(/\bslice\s*[:#-]?\s*\d+\b/gi, '')
    .replace(/\bsegment\s*[:#-]?\s*(\d+)\b/gi, '录屏 #$1')
    .replace(/\s*｜\s*｜\s*/g, '｜')
    .replace(/^｜|｜$/g, '')
    .trim();
  return sanitized || null;
}

export function formatVerdictLabel(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'scale') return '建议放量';
  if (normalized === 'observe') return '继续观察';
  if (normalized === 'optimize') return '优先优化';
  if (normalized === 'review') return '人工复核';
  if (normalized === 'insufficient') return '证据不足';
  return value || '待判断';
}

export function formatReviewPriorityLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (['urgent', 'critical', 'high', 'p0', 'p1'].includes(normalized)) {
    return '高';
  }
  if (['medium', 'mid', 'normal', 'p2'].includes(normalized)) {
    return '中';
  }
  if (['low', 'p3', 'p4'].includes(normalized)) {
    return '低';
  }
  return value?.trim() || null;
}

export function resolveVerdictBadge(
  value: string | null | undefined
): 'success' | 'warning' | 'error' | 'danger' | 'info' | 'neutral' {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'scale') return 'success';
  if (normalized === 'observe') return 'info';
  if (normalized === 'optimize') return 'warning';
  if (normalized === 'insufficient') return 'danger';
  return 'neutral';
}

export function resolveScorecardBadge(
  value: string
): 'success' | 'warning' | 'error' | 'danger' | 'info' | 'neutral' {
  const normalized = value.trim().toLowerCase();
  if (['good', 'pass', 'strong', 'scale'].includes(normalized)) return 'success';
  if (['watch', 'observe', 'medium'].includes(normalized)) return 'info';
  if (['weak', 'optimize', 'warning'].includes(normalized)) return 'warning';
  if (['insufficient', 'risk', 'bad', 'danger'].includes(normalized)) return 'danger';
  return 'neutral';
}
