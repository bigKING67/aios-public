import { normalizeToken } from './platform-tab-token-formatters';

interface PlatformTrendItem {
  metric: unknown;
}

export function calcChangePercent(current: number, previous: number): number | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return undefined;
  }

  if (Math.abs(previous) < Number.EPSILON) {
    return current === 0 ? 0 : undefined;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

export function findPlatformTrend<T extends PlatformTrendItem>(
  trends: T[],
  metric: string,
  platformAliases: string[]
): T | undefined {
  const normalizedMetric = normalizeToken(metric);
  const exactMetricNames = new Set<string>();

  for (const alias of platformAliases) {
    exactMetricNames.add(`${alias}${normalizedMetric}`);
    exactMetricNames.add(`${normalizedMetric}${alias}`);
  }

  const normalizedTrends = trends.map((item) => ({
    raw: item,
    normalizedMetricName: normalizeToken(String(item.metric || '')),
  }));

  const exactMatch = normalizedTrends.find((item) =>
    exactMetricNames.has(item.normalizedMetricName)
  );
  if (exactMatch) {
    return exactMatch.raw;
  }

  const fuzzyMatch = normalizedTrends.find(
    (item) =>
      item.normalizedMetricName.includes(normalizedMetric) &&
      platformAliases.some((alias) => item.normalizedMetricName.includes(alias))
  );
  if (fuzzyMatch) {
    return fuzzyMatch.raw;
  }

  const globalFallback = normalizedTrends.find(
    (item) => item.normalizedMetricName === normalizedMetric
  );
  return globalFallback?.raw;
}

export function safeDivide(numerator: number, denominator: number): number | undefined {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    Math.abs(denominator) < Number.EPSILON
  ) {
    return undefined;
  }
  return numerator / denominator;
}
