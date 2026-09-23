import {
  normalizeToken,
  toOptionalNumber,
} from './platform-tab-formatters';
type RawAttributionItem = Record<string, unknown>;

export interface DouyinSectionTotals {
  current: number;
  prev: number;
  delta: number;
}

interface ResolveDouyinSectionTotalsParams<T> {
  attribution: RawAttributionItem | undefined;
  rows: T[];
  getCurrent: (row: T) => number;
  getPrev: (row: T) => number;
}

function toRecord(value: unknown): RawAttributionItem | undefined {
  return typeof value === 'object' && value !== null ? (value as RawAttributionItem) : undefined;
}

export function findPlatformAttributionItem(
  items: unknown[],
  platformAliases: string[]
): RawAttributionItem | undefined {
  for (const item of items) {
    const record = toRecord(item);
    if (!record) {
      continue;
    }

    const platformToken = normalizeToken(String(record.platform || ''));
    if (platformAliases.includes(platformToken)) {
      return record;
    }
  }

  return undefined;
}

export function buildTopAbsoluteDeltaRows<T>(
  rows: T[],
  getDelta: (row: T) => number,
  limit = 80
): T[] {
  return [...rows]
    .sort((left, right) => Math.abs(getDelta(right)) - Math.abs(getDelta(left)))
    .slice(0, limit);
}

export function resolveDouyinSectionTotals<T>({
  attribution,
  rows,
  getCurrent,
  getPrev,
}: ResolveDouyinSectionTotalsParams<T>): DouyinSectionTotals {
  const current = toOptionalNumber(attribution?.total_curr_gmv) ??
    rows.reduce((sum, row) => sum + getCurrent(row), 0);
  const prev = toOptionalNumber(attribution?.total_prev_gmv) ??
    rows.reduce((sum, row) => sum + getPrev(row), 0);

  return {
    current,
    prev,
    delta: current - prev,
  };
}
