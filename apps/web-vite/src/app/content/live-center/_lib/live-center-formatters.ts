import type { BadgeStatus } from '@/components/atoms/badge';

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const fullDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const clockMinuteFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
});
const businessDateTimePattern =
  /^\s*(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*(?:Z|[+-]\d{2}(?::?\d{2})?))?\s*$/;

const numberFormatter = new Intl.NumberFormat('zh-CN');
const compactNumberFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  currency: 'CNY',
  maximumFractionDigits: 0,
  style: 'currency',
});

export function formatDateTime(value?: string | null, fallback = '-'): string {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return dateTimeFormatter.format(parsed);
}

export function formatFullDateTime(value?: string | null, fallback = '-'): string {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return fullDateTimeFormatter.format(parsed);
}

export function formatClockMinute(value?: string | null, fallback = '-'): string {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return clockMinuteFormatter.format(parsed);
  }

  const matched = value.match(/[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?/);
  if (matched) {
    return `${matched[1]}:${matched[2]}`;
  }

  return fallback;
}

export function formatBusinessDateTime(value?: string | null, fallback = '-'): string {
  const parts = parseBusinessDateTimeParts(value);
  if (!parts) {
    return fallback;
  }
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatBusinessClockMinute(value?: string | null, fallback = '-'): string {
  const parts = parseBusinessDateTimeParts(value);
  if (!parts) {
    return fallback;
  }
  return `${parts.hour}:${parts.minute}`;
}

export function formatInteger(value?: number | null, fallback = '-'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return numberFormatter.format(value);
}

export function formatCompactNumber(value?: number | null, fallback = '-'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return compactNumberFormatter.format(value);
}

export function formatCurrency(value?: number | null, fallback = '-'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return currencyFormatter.format(value);
}

export function formatDurationMinutes(value?: number | null, fallback = '-'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const minutes = Math.max(0, Math.round(value));
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours <= 0) {
    return `${restMinutes} 分钟`;
  }
  return `${hours} 小时 ${restMinutes} 分钟`;
}

export function formatDurationSeconds(value?: number | null, fallback = '-'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatFileSize(value?: number | null, fallback = '-'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const STATUS_LABELS: Record<string, string> = {
  active: '可用',
  completed: '已完成',
  complete: '已完成',
  failed: '失败',
  matched: '已匹配',
  missing: '缺失',
  overlap_resolved: '重叠已归属',
  pending: '待处理',
  processing: '处理中',
  queued: '排队中',
  ready: '可播放',
  running: '运行中',
  succeeded: '已成功',
  uploaded: '已上传',
  uploading: '上传中',
};

const ANALYSIS_STATUS_LABELS: Record<string, string> = {
  complete: 'AI 已完成',
  completed: 'AI 已完成',
  error: 'AI 失败',
  failed: 'AI 失败',
  pending: 'AI 待处理',
  processing: 'AI 运行中',
  queued: 'AI 排队中',
  running: 'AI 运行中',
  succeeded: 'AI 已完成',
};

export function formatStatusLabel(status?: string | null, fallback = '未开始'): string {
  const normalized = status?.trim();
  if (!normalized) {
    return fallback;
  }
  return STATUS_LABELS[normalized.toLowerCase()] ?? normalized;
}

export function formatAnalysisStatusLabel(status?: string | null, fallback = 'AI 未开始'): string {
  const normalized = status?.trim();
  if (!normalized) {
    return fallback;
  }
  return ANALYSIS_STATUS_LABELS[normalized.toLowerCase()] ?? `AI ${formatStatusLabel(normalized, normalized)}`;
}

export function resolveStatusBadge(status?: string | null): BadgeStatus {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) {
    return 'neutral';
  }
  if (['active', 'complete', 'completed', 'matched', 'ready', 'succeeded', 'uploaded'].includes(normalized)) {
    return 'success';
  }
  if (['failed', 'error', 'missing'].includes(normalized)) {
    return 'danger';
  }
  if (['processing', 'running', 'uploading'].includes(normalized)) {
    return 'info';
  }
  if (['overlap_resolved', 'pending', 'queued'].includes(normalized)) {
    return 'warning';
  }
  return 'neutral';
}

function parseBusinessDateTimeParts(value?: string | null): {
  day: string;
  hour: string;
  minute: string;
  month: string;
} | null {
  if (!value) {
    return null;
  }

  const matched = businessDateTimePattern.exec(value);
  if (!matched) {
    return null;
  }

  const [, , month, day, hour, minute, second] = matched;
  if (
    !isInRange(month, 1, 12) ||
    !isInRange(day, 1, 31) ||
    !isInRange(hour, 0, 23) ||
    !isInRange(minute, 0, 59) ||
    (second ? !isInRange(second, 0, 59) : false)
  ) {
    return null;
  }

  return { day, hour, minute, month };
}

function isInRange(value: string, min: number, max: number): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}
