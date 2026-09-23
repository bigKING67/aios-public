import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';

export function formatPeriodDatePart(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return undefined;
  }

  return `${year}/${month}/${day}`;
}

export function resolveSummaryWeekPeriod(report: WeeklyReportResponse): string | undefined {
  const rawReportId =
    typeof report.meta?.report_id === 'string'
      ? report.meta.report_id.trim()
      : '';

  if (rawReportId.includes('~') || rawReportId.includes('～')) {
    return rawReportId.replace(/～/g, '~');
  }

  const periodStart = formatPeriodDatePart(report.meta?.period_start);
  const periodEnd = formatPeriodDatePart(report.meta?.period_end);
  if (periodStart && periodEnd) {
    return `${periodStart}~${periodEnd}`;
  }

  return undefined;
}

export function normalizeWeekPeriod(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().replace(/～/g, '~').replace(/\s+/g, '');
  return normalized.includes('~') ? normalized : undefined;
}

export function formatWeekPeriodLabel(value: string): string {
  return value.replace(/~/g, '～');
}
