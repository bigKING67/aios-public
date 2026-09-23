import type { WeeklySummaryAIScope } from '@/config/weekly-summary-ai';

export function normalizeQueryValue(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const lower = normalized.toLowerCase();
  if (lower === 'undefined' || lower === 'null') {
    return undefined;
  }

  return normalized;
}

export function normalizeWeekPeriodValue(value?: string): string | undefined {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return undefined;
  }

  const normalizedSeparator = normalized.replace(/～/g, '~');
  const compactValue = normalizedSeparator.replace(/\s+/g, '');
  return compactValue.includes('~') ? compactValue : undefined;
}

export function looksLikeWeekPeriod(value: string): boolean {
  return Boolean(normalizeWeekPeriodValue(value));
}

export function normalizeSummaryScopeValue(
  value?: WeeklySummaryAIScope
): WeeklySummaryAIScope | undefined {
  if (value === 'overview' || value === 'tmall' || value === 'global') {
    return value;
  }
  return undefined;
}

export function resolveWeeklySummaryQuery(
  reportId: string,
  weekPeriod?: string
): { safeReportId: string; normalizedWeekPeriod?: string } {
  const normalizedReportId = normalizeQueryValue(reportId);
  const reportIdLooksLikeWeekPeriod = Boolean(
    normalizedReportId && looksLikeWeekPeriod(normalizedReportId)
  );
  const normalizedWeekPeriod =
    normalizeWeekPeriodValue(weekPeriod) ||
    (reportIdLooksLikeWeekPeriod
      ? normalizeWeekPeriodValue(normalizedReportId)
      : undefined);

  const safeReportId =
    !normalizedReportId ||
    normalizedReportId.includes('/') ||
    reportIdLooksLikeWeekPeriod ||
    normalizedReportId.toLowerCase() === 'latest'
      ? 'latest'
      : normalizedReportId;

  return {
    safeReportId,
    normalizedWeekPeriod,
  };
}
