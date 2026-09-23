import { asRecord } from '@/lib/unknown-data';
import {
  formatWeekPeriodLabel,
  normalizeWeekPeriod,
} from './overview-period-utils';

const BY_WEEK_WINDOW = 5;

export interface OverviewByWeekTrendItem {
  name: string;
  value: number;
  secondaryValue: number;
}

export interface OverviewByWeekTrendQueryState {
  isLoading?: boolean;
  isFetching?: boolean;
}

interface OverviewByWeekPeriodItem {
  value: string;
}

interface OverviewByWeekReportMetrics {
  gmv: number;
  gsv: number;
}

function extractKpiValue(rawReport: unknown, kpiKey: string): number | undefined {
  const reportRecord = asRecord(rawReport);
  const kpis = Array.isArray(reportRecord?.kpis)
    ? reportRecord.kpis.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];

  const target = kpis.find((item) => String(item?.key || '').toLowerCase() === kpiKey.toLowerCase());
  const value = Number(target?.value);
  return Number.isFinite(value) ? value : undefined;
}

export function resolveOverviewByWeekReportMetrics(
  rawReport: unknown
): OverviewByWeekReportMetrics | undefined {
  const gmv = extractKpiValue(rawReport, 'gmv');
  if (!Number.isFinite(gmv ?? NaN)) {
    return undefined;
  }

  const gsv = extractKpiValue(rawReport, 'gsv');
  const refund = extractKpiValue(rawReport, 'refund');
  const resolvedGsv = Number.isFinite(gsv ?? NaN)
    ? Number(gsv)
    : Number.isFinite(refund ?? NaN)
      ? Number(gmv) - Number(refund)
      : undefined;

  if (!Number.isFinite(resolvedGsv ?? NaN)) {
    return undefined;
  }

  return {
    gmv: Number(gmv),
    gsv: Number(resolvedGsv),
  };
}

export function resolveRecentWeekPeriods(
  weeklyPeriods: OverviewByWeekPeriodItem[],
  summaryWeekPeriod?: string
): string[] {
  const normalizedList = weeklyPeriods
    .map((item) => normalizeWeekPeriod(item.value))
    .filter((item): item is string => Boolean(item));

  if (!normalizedList.length) {
    return [];
  }

  const normalizedSummaryWeekPeriod = normalizeWeekPeriod(summaryWeekPeriod);
  const anchorIndex = normalizedSummaryWeekPeriod
    ? normalizedList.indexOf(normalizedSummaryWeekPeriod)
    : -1;
  const startIndex = anchorIndex >= 0 ? anchorIndex : 0;

  return normalizedList.slice(startIndex, startIndex + BY_WEEK_WINDOW).reverse();
}

export function buildOverviewByWeekTrendData(
  recentWeekPeriods: string[],
  rawReports: Array<unknown | undefined>
): OverviewByWeekTrendItem[] {
  return recentWeekPeriods
    .map((weekPeriod, index) => {
      const metrics = resolveOverviewByWeekReportMetrics(rawReports[index]);
      if (!metrics) {
        return null;
      }

      return {
        name: formatWeekPeriodLabel(weekPeriod),
        value: metrics.gmv,
        secondaryValue: metrics.gsv,
      };
    })
    .filter((item): item is OverviewByWeekTrendItem => Boolean(item));
}

export function resolveOverviewByWeekTrendLoadingState({
  hasPeriodListLoading,
  queryStates,
  trendDataLength,
}: {
  hasPeriodListLoading: boolean;
  queryStates: OverviewByWeekTrendQueryState[];
  trendDataLength: number;
}): boolean {
  if (trendDataLength > 0) {
    return false;
  }

  return (
    hasPeriodListLoading ||
    queryStates.some((query) => Boolean(query.isLoading || query.isFetching))
  );
}
