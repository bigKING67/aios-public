import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type StudioAssetSegmentSummary,
  type StudioAssetSegmentSummaryListResponse,
  type StudioCapabilitiesResponse,
  type StudioOverviewPeriodKey,
  type StudioOverviewResponse,
  type StudioConfirmContentSegmentsRequest,
  type StudioConfirmContentSegmentsResponse,
  type StudioContentSegment,
  type StudioContentSegmentConflictResponse,
  type StudioContentSegmentListQuery,
  type StudioContentSegmentListResponse,
  type StudioCreateContentSegmentRequest,
  type StudioSegmentPoolResponse,
  type StudioSegmentPresetListResponse,
  type StudioUpdateContentSegmentRequest,
} from '@/lib/generated-api-contract';

export type {
  StudioAssetSegmentSummary,
  StudioCapabilitiesResponse,
  StudioOverviewPeriodKey,
  StudioOverviewResponse,
  StudioContentSegment,
  StudioContentSegmentConflictResponse,
  StudioContentSegmentListQuery,
  StudioCreateContentSegmentRequest,
  StudioUpdateContentSegmentRequest,
};
export type {
  StudioOverviewActivity,
  StudioSegmentAssetCover,
  StudioSegmentPoolCell,
  StudioSegmentPreset,
  StudioSegmentPresetLabel,
} from '@/lib/generated-api-contract';

export type StudioSegmentStatus = NonNullable<StudioContentSegmentListQuery['status']>;
export type StudioSegmentOrigin = NonNullable<StudioContentSegmentListQuery['origin']>;

/** Writes are never retried automatically: a lost response could hide an applied change. */
const NO_RETRY = { retryAttempts: 0 } as const;

const STUDIO_ROOT_QUERY_KEY = ['content-ai-studio'] as const;

export const aiStudioQueryKeys = {
  root: STUDIO_ROOT_QUERY_KEY,
  capabilities: () => [...STUDIO_ROOT_QUERY_KEY, 'capabilities'] as const,
  presets: () => [...STUDIO_ROOT_QUERY_KEY, 'presets'] as const,
  segments: () => [...STUDIO_ROOT_QUERY_KEY, 'segments'] as const,
  segmentList: (query: StudioContentSegmentListQuery) => [...STUDIO_ROOT_QUERY_KEY, 'segments', query] as const,
  /** Nested under `segments` so every segment write also refreshes the pool. */
  segmentPool: (presetKey: string, presetVersion: number) =>
    [...STUDIO_ROOT_QUERY_KEY, 'segments', 'pool', presetKey, presetVersion] as const,
  /** Home overview; segment and batch writes invalidate the unparameterised prefix. */
  overview: (period?: StudioOverviewPeriodKey) =>
    period ? ([...STUDIO_ROOT_QUERY_KEY, 'overview', period] as const) : ([...STUDIO_ROOT_QUERY_KEY, 'overview'] as const),
  assetSummaries: (assetIds: readonly string[], presetKey?: string) =>
    [...STUDIO_ROOT_QUERY_KEY, 'asset-summaries', presetKey ?? 'all', assetIds] as const,
};

/**
 * Everything derived from segments: lists and pool, the home overview, per-asset
 * counts, and the remix product list / availability preview. Every segment write
 * invalidates these prefixes (the app keeps queries fresh for minutes otherwise).
 */
export const SEGMENT_DEPENDENT_QUERY_PREFIXES = [
  aiStudioQueryKeys.segments(),
  aiStudioQueryKeys.overview(),
  [...STUDIO_ROOT_QUERY_KEY, 'asset-summaries'],
  [...STUDIO_ROOT_QUERY_KEY, 'remix-products'],
  [...STUDIO_ROOT_QUERY_KEY, 'remix-preview'],
] as const;

export async function fetchStudioCapabilities(options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioCapabilitiesResponse>(AIOS_API_PATHS.contentStudioCapabilities, {
      signal: options?.signal,
    })
  ).data;
}

/** Estimated spend, pipeline counts and recent work for the home page. */
export async function fetchStudioOverview(period: StudioOverviewPeriodKey, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioOverviewResponse>(AIOS_API_PATHS.contentStudioOverview, {
      params: { period },
      signal: options?.signal,
    })
  ).data;
}

export async function fetchStudioPresets(options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioSegmentPresetListResponse>(AIOS_API_PATHS.contentStudioPresets, {
      signal: options?.signal,
    })
  ).data.items;
}

/** Annotation counts for up to 100 library assets, in request order; `presetKey` scopes to one preset. */
export async function fetchStudioAssetSegmentSummaries(
  assetIds: readonly string[],
  options?: { signal?: AbortSignal; presetKey?: string }
) {
  return (
    await apiClient.get<StudioAssetSegmentSummaryListResponse>(AIOS_API_PATHS.contentStudioAssetSegmentSummaries, {
      params: options?.presetKey ? { assetIds: assetIds.join(','), presetKey: options.presetKey } : { assetIds: assetIds.join(',') },
      signal: options?.signal,
    })
  ).data.items;
}

/** Usable confirmed segments per (product, label) for one preset version. */
export async function fetchStudioSegmentPool(presetKey: string, presetVersion: number, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioSegmentPoolResponse>(AIOS_API_PATHS.contentStudioSegmentPool, {
      params: { presetKey, presetVersion },
      signal: options?.signal,
    })
  ).data;
}

/** Drops empty filters so the query key and request stay canonical. */
export function buildStudioSegmentParams(query: StudioContentSegmentListQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'number' && Number.isFinite(value)) params[key] = value;
    if (typeof value === 'string' && value.trim()) params[key] = value.trim();
  }
  return params;
}

export async function fetchStudioSegments(
  query: StudioContentSegmentListQuery,
  options?: { signal?: AbortSignal },
) {
  return (
    await apiClient.get<StudioContentSegmentListResponse>(AIOS_API_PATHS.contentStudioSegments, {
      params: buildStudioSegmentParams(query),
      signal: options?.signal,
    })
  ).data;
}

/** Walks cursors for one asset/preset so the timeline shows every interval, bounded by `maxPages`. */
export async function fetchAllStudioSegments(
  query: Omit<StudioContentSegmentListQuery, 'cursor' | 'limit'>,
  options?: { signal?: AbortSignal; maxPages?: number },
): Promise<{ items: StudioContentSegment[]; truncated: boolean }> {
  const maxPages = options?.maxPages ?? 5;
  const items: StudioContentSegment[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchStudioSegments({ ...query, cursor, limit: 200 }, options);
    items.push(...response.items);
    if (!response.nextCursor) return { items, truncated: false };
    cursor = response.nextCursor;
  }
  return { items, truncated: true };
}

export async function createStudioSegment(request: StudioCreateContentSegmentRequest) {
  return (
    await apiClient.post<StudioContentSegment>(AIOS_API_PATHS.contentStudioSegments, request, NO_RETRY)
  ).data;
}

export async function updateStudioSegment(segmentId: string, request: StudioUpdateContentSegmentRequest) {
  return (
    await apiClient.patch<StudioContentSegment>(AIOS_API_PATHS.contentStudioSegment(segmentId), request, NO_RETRY)
  ).data;
}

/** All-or-nothing on the server: any stale, changed or overlapping item rejects the whole batch. */
export async function confirmStudioSegments(items: StudioConfirmContentSegmentsRequest['items']) {
  return (
    await apiClient.post<StudioConfirmContentSegmentsResponse>(
      AIOS_API_PATHS.contentStudioSegmentsConfirm,
      { items },
      NO_RETRY,
    )
  ).data.items;
}
