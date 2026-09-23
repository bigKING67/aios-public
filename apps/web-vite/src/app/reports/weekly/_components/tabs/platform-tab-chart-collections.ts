import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import { normalizeToken } from './platform-tab-formatters';
import type {
  ChartCollectionItem,
  ChartCollectionItems,
  PlatformChartCollectionKey,
} from './platform-tab-chart-source-types';

function getChartItems<Key extends PlatformChartCollectionKey>(
  report: WeeklyReportResponse,
  key: Key
): ChartCollectionItems<Key> {
  const value = report.charts?.[key];
  return Array.isArray(value) ? value as ChartCollectionItems<Key> : [];
}

export function findChartItemByPlatform<Key extends PlatformChartCollectionKey>(
  report: WeeklyReportResponse,
  key: Key,
  platformAliases: string[]
): ChartCollectionItem<Key> | undefined {
  return getChartItems(report, key).find((item) => {
    const platformToken = normalizeToken(String((item as { platform?: unknown })?.platform || ''));
    return platformAliases.includes(platformToken);
  });
}

export function getChartCollection<Key extends PlatformChartCollectionKey>(
  report: WeeklyReportResponse,
  key: Key
): ChartCollectionItems<Key> {
  return getChartItems(report, key);
}
