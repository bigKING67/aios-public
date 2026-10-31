export type SourceSpendClass = 'qualified' | 'low' | 'unknown';

export interface SourceSpendSnapshot {
  spend30d: number | null;
  class: string;
  asOf: string | null;
  complete: boolean;
  syncedDays: number;
  windowDays: number;
}

export interface SourceSpendCounts {
  qualified: number;
  low: number;
  unknown: number;
}

export const SOURCE_SPEND_FILTER_OPTIONS: readonly { value: SourceSpendClass | ''; label: string }[] = [
  { value: '', label: '全部消耗' },
  { value: 'qualified', label: '达标' },
  { value: 'low', label: '低消耗' },
  { value: 'unknown', label: '无数据' },
];

const SOURCE_SPEND_CLASSES = new Set<SourceSpendClass>(['qualified', 'low', 'unknown']);

export function readSourceSpendClass(value: string | null | undefined): SourceSpendClass | undefined {
  return value && SOURCE_SPEND_CLASSES.has(value as SourceSpendClass) ? (value as SourceSpendClass) : undefined;
}

/** Compact business amount for source-spend labels: ¥5,000 / ¥1.2万. */
export function formatSourceSpendAmount(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) < 10_000) return `¥${Math.round(value).toLocaleString('zh-CN')}`;
  const wan = value / 10_000;
  return `¥${Number(wan >= 100 ? wan.toFixed(0) : wan.toFixed(1))}万`;
}

export function sourceSpendLabel(spend: SourceSpendSnapshot | null | undefined): string {
  const classification = readSourceSpendClass(spend?.class);
  if (!classification || classification === 'unknown') return '无数据';
  const amount = typeof spend?.spend30d === 'number' ? formatSourceSpendAmount(spend.spend30d) : '';
  return `${classification === 'qualified' ? '达标' : '低消耗'}${amount ? ` ${amount}` : ''}`;
}

export function sourceSpendCoverage(spend: SourceSpendSnapshot | null | undefined, compact = false): string | null {
  if (!spend || spend.complete) return null;
  const synced = Math.max(0, Math.trunc(spend.syncedDays));
  const window = Math.max(0, Math.trunc(spend.windowDays));
  const coverage = compact ? `消耗 ${synced}/${window} 天` : `消耗只同步了 ${synced}/${window} 天`;
  const amount = typeof spend.spend30d === 'number' ? formatSourceSpendAmount(spend.spend30d) : '';
  if (!amount) return coverage;
  return `${coverage} · ${compact ? '小计' : '已知小计'} ${amount}`;
}

export function sourceSpendCountsLabel(counts: SourceSpendCounts): string {
  return `达标 ${counts.qualified} · 低消耗 ${counts.low} · 无数据 ${counts.unknown}`;
}

/**
 * New batches freeze one class on every source segment. Old or partially
 * populated batches stay silent rather than presenting a misleading total.
 * Admission treats 无数据 as low-spend, so the compact output summary does too.
 */
export function frozenAdmissionSummary(
  segments: readonly { spendClass?: string | null }[],
): { qualified: number; low: number; label: string } | null {
  if (segments.length === 0) return null;
  const classes = segments.map((segment) => readSourceSpendClass(segment.spendClass));
  if (classes.some((classification) => classification === undefined)) return null;
  const qualified = classes.filter((classification) => classification === 'qualified').length;
  const low = classes.length - qualified;
  return { qualified, low, label: `达标 ${qualified} 段 · 低消耗 ${low} 段` };
}
