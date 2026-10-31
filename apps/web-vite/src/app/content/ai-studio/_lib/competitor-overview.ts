/**
 * 竞品爆款 · 爆款分析 read model: counts from the overview endpoint (same scope as the
 * statistics snapshot), defensive like the patterns reader so a partial payload renders
 * what it has. The page uses them for the empty state and the 拆解中 count.
 */
import { apiClient } from '@/lib/api-client';
import { AIOS_API_PATHS, type StudioCompetitorOverviewResponse } from '@/lib/generated-api-contract';
import { aiStudioQueryKeys } from './ai-studio-api';
import type { PeriodQuery } from './studio-period';

export const competitorOverviewQueryKeys = {
  overview: (category: string, period: PeriodQuery) =>
    [...aiStudioQueryKeys.root, 'competitor', 'overview', category, period] as const,
};

export async function fetchCompetitorOverview(
  category: string,
  period: PeriodQuery,
  options?: { signal?: AbortSignal },
): Promise<StudioCompetitorOverviewResponse> {
  return (
    await apiClient.get<StudioCompetitorOverviewResponse>(AIOS_API_PATHS.contentStudioCompetitorOverview, {
      params: { category, ...period },
      signal: options?.signal,
    })
  ).data;
}

export interface OverviewCounts {
  analyzed: number;
  brands: number;
}

export interface Overview {
  current: OverviewCounts;
  previous: OverviewCounts | null;
  analyzing: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function readCounts(value: unknown): OverviewCounts {
  const item = record(value);
  return { analyzed: count(item.analyzed), brands: count(item.brands) };
}

export function readOverview(value: unknown): Overview {
  const payload = record(value);
  return {
    current: readCounts(payload.current),
    previous: payload.previous ? readCounts(payload.previous) : null,
    analyzing: count(payload.analyzing),
  };
}
