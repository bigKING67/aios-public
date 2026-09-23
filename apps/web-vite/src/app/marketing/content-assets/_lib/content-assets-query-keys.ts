import type {
  ContentAssetPerformanceDailyQueryParams,
  ContentAssetProcessingJobQueryParams,
  ContentAssetQueryParams,
  ContentAssetUnmatchedStatsQueryParams,
} from './content-assets-types';

const CONTENT_ASSET_ROOT_QUERY_KEY = ['marketing', 'content-assets'] as const;

export const contentAssetsQueryKeys = {
  root: CONTENT_ASSET_ROOT_QUERY_KEY,
  list: (query: ContentAssetQueryParams) => [...CONTENT_ASSET_ROOT_QUERY_KEY, 'list', query] as const,
  detail: (assetId: string | null) => [...CONTENT_ASSET_ROOT_QUERY_KEY, 'detail', assetId] as const,
  performanceDaily: (assetId: string | null, query: ContentAssetPerformanceDailyQueryParams) =>
    [...CONTENT_ASSET_ROOT_QUERY_KEY, 'performance-daily', assetId, query] as const,
  analysisResult: (assetId: string | null, objectKey?: string | null) =>
    [...CONTENT_ASSET_ROOT_QUERY_KEY, 'analysis-result', assetId, objectKey || 'latest'] as const,
  coverage: () => [...CONTENT_ASSET_ROOT_QUERY_KEY, 'coverage'] as const,
  filterOptions: () => [...CONTENT_ASSET_ROOT_QUERY_KEY, 'filter-options'] as const,
  lookup: (keyword: string) => [...CONTENT_ASSET_ROOT_QUERY_KEY, 'lookup', keyword] as const,
  processingJobs: (query: ContentAssetProcessingJobQueryParams) =>
    [...CONTENT_ASSET_ROOT_QUERY_KEY, 'processing-jobs', query] as const,
  unmatchedStats: (query: ContentAssetUnmatchedStatsQueryParams) =>
    [...CONTENT_ASSET_ROOT_QUERY_KEY, 'unmatched-stats', query] as const,
};
