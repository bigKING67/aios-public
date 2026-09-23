import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';

export function formatDateLabel(dateText: string): string {
  const parsedDate = new Date(dateText);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateText;
  }

  return parsedDate.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });
}

function formatSummaryDatePart(value?: string): string | undefined {
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

export function resolvePlatformSummaryWeekPeriod(
  report: WeeklyReportResponse
): string | undefined {
  const rawReportId =
    typeof report.meta?.report_id === 'string' ? report.meta.report_id.trim() : '';

  if (rawReportId.includes('~') || rawReportId.includes('～')) {
    return rawReportId.replace(/～/g, '~');
  }

  const periodStart = formatSummaryDatePart(report.meta?.period_start);
  const periodEnd = formatSummaryDatePart(report.meta?.period_end);
  if (periodStart && periodEnd) {
    return `${periodStart}~${periodEnd}`;
  }

  return undefined;
}

export function formatDateText(dateText?: string): string {
  if (!dateText) {
    return '--';
  }

  const parsedDate = new Date(dateText);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateText;
  }

  return parsedDate.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
