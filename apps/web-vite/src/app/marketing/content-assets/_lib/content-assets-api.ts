import { apiClient } from '@/lib/api-client';
import type {
  ContentAssetAnalysisResultResponse,
  ContentAssetDetailResponse,
  ContentAssetCoverageSummary,
  ContentAssetFilterOptions,
  ContentAssetListResponse,
  ContentAssetLookupResponse,
  ContentAssetPerformanceDailyQueryParams,
  ContentAssetPerformanceDailyResponse,
  ContentAssetAiJobBackfillPayload,
  ContentAssetAiJobBackfillResponse,
  ContentAssetAnalysisJobCreatePayload,
  ContentAssetProcessingJob,
  ContentAssetProcessingJobBackfillPayload,
  ContentAssetProcessingJobBackfillResponse,
  ContentAssetProcessingJobListResponse,
  ContentAssetProcessingJobQueryParams,
  ContentAssetQueryParams,
  ContentAssetUnmatchedStatsBindPayload,
  ContentAssetUnmatchedStatsBindResponse,
  ContentAssetUnmatchedStatsQueryParams,
  ContentAssetUnmatchedStatsResponse,
  ContentAssetAdMaterialCreatePayload,
  ContentAssetAdMaterialUpdatePayload,
  ContentAssetDouyinVideoIdResolvePayload,
  ContentAssetDouyinVideoIdResolveResponse,
  ContentAssetPlatformVideoCreatePayload,
  ContentAssetPlatformVideoUpdatePayload,
  ContentAssetProfileUpdatePayload,
  ContentAssetUploadCompletePayload,
  ContentAssetUploadCreatePayload,
  ContentAssetUploadCreateResponse,
  ContentAssetTranscriptJobCreatePayload,
  ContentAssetVideoLinkImportPayload,
  ContentAssetVideoLinkImportResponse,
  ImportRunCreatePayload,
  ImportRunCreateResponse,
  PlaybackUrlResponse,
  PlaybackVariant,
  ContentAssetVideoLinkPreviewPayload,
  ContentAssetVideoLinkPreviewResponse,
} from './content-assets-types';
import { normalizeContentAssetTagList } from './content-assets-tags';
import { normalizeContentAssetVideoTypeValue } from './content-assets-ui-helpers';

const BASE_PATH = '/v1/marketing/content-assets';

export function buildContentAssetParams(
  query: ContentAssetQueryParams
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {
    page: query.page,
    page_size: query.pageSize,
    sort: query.sort,
  };
  const keyword = query.keyword?.trim();
  if (keyword) params.keyword = keyword;
  if (query.platform) params.platform = query.platform;
  if (query.productName) params.product_name = query.productName;
  if (query.creatorName) params.creator_name = query.creatorName;
  if (query.ownerUserId) params.owner_user_id = query.ownerUserId;
  const videoType = normalizeContentAssetVideoTypeValue(query.videoType);
  if (videoType) params.video_type = videoType;
  if (query.contentScene) params.content_scene = query.contentScene;
  if (query.contentSceneGroup) params.content_scene_group = query.contentSceneGroup;
  if (query.contentSceneSubtype) params.content_scene_subtype = query.contentSceneSubtype;
  const tags = normalizeContentAssetTagList(query.tags);
  if (tags.length > 0) params.tags = tags.join(',');
  if (query.assetStatus) params.asset_status = query.assetStatus;
  if (query.lifecycleStatus) params.lifecycle_status = query.lifecycleStatus;
  if (query.externalOnly !== undefined) params.external_only = String(query.externalOnly);
  if (query.todo) params.todo = query.todo;
  return params;
}

export async function fetchContentAssets(
  query: ContentAssetQueryParams,
  options?: { signal?: AbortSignal }
): Promise<ContentAssetListResponse> {
  const response = await apiClient.get<ContentAssetListResponse>(`${BASE_PATH}/assets`, {
    params: buildContentAssetParams(query),
    signal: options?.signal,
  });
  return response.data;
}

export async function fetchContentAssetFilterOptions(): Promise<ContentAssetFilterOptions> {
  const response = await apiClient.get<ContentAssetFilterOptions>(`${BASE_PATH}/filter-options`);
  return response.data;
}

export async function fetchContentAssetCoverage(): Promise<ContentAssetCoverageSummary> {
  const response = await apiClient.get<ContentAssetCoverageSummary>(`${BASE_PATH}/coverage`);
  return response.data;
}

export async function fetchContentAssetLookup(
  query: { keyword?: string; limit?: number } = {},
  options?: { signal?: AbortSignal }
): Promise<ContentAssetLookupResponse> {
  const response = await apiClient.get<ContentAssetLookupResponse>(`${BASE_PATH}/assets/lookup`, {
    params: {
      ...(query.keyword?.trim() ? { keyword: query.keyword.trim() } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    },
    signal: options?.signal,
  });
  return response.data;
}

export async function fetchContentAssetProcessingJobs(
  query: ContentAssetProcessingJobQueryParams = {},
  options?: { signal?: AbortSignal }
): Promise<ContentAssetProcessingJobListResponse> {
  const response = await apiClient.get<ContentAssetProcessingJobListResponse>(`${BASE_PATH}/processing-jobs`, {
    params: {
      ...(query.assetId?.trim() ? { assetId: query.assetId.trim() } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.jobType ? { jobType: query.jobType } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    },
    signal: options?.signal,
  });
  return response.data;
}

export async function fetchContentAssetUnmatchedStats(
  query: ContentAssetUnmatchedStatsQueryParams = {},
  options?: { signal?: AbortSignal }
): Promise<ContentAssetUnmatchedStatsResponse> {
  const response = await apiClient.get<ContentAssetUnmatchedStatsResponse>(`${BASE_PATH}/unmatched-stats`, {
    params: {
      ...(query.matchType ? { matchType: query.matchType } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    },
    signal: options?.signal,
  });
  return response.data;
}

export async function bindContentAssetUnmatchedStats(
  payload: ContentAssetUnmatchedStatsBindPayload
): Promise<ContentAssetUnmatchedStatsBindResponse> {
  const response = await apiClient.post<ContentAssetUnmatchedStatsBindResponse>(
    `${BASE_PATH}/unmatched-stats`,
    payload
  );
  return response.data;
}

export async function retryContentAssetProcessingJob(jobId: string): Promise<ContentAssetProcessingJob> {
  const response = await apiClient.post<ContentAssetProcessingJob>(`${BASE_PATH}/processing-jobs/${jobId}/retry`);
  return response.data;
}

export async function cancelContentAssetProcessingJob(jobId: string): Promise<ContentAssetProcessingJob> {
  const response = await apiClient.post<ContentAssetProcessingJob>(`${BASE_PATH}/processing-jobs/${jobId}/cancel`);
  return response.data;
}

export async function resetStaleContentAssetProcessingJob(jobId: string): Promise<ContentAssetProcessingJob> {
  const response = await apiClient.post<ContentAssetProcessingJob>(
    `${BASE_PATH}/processing-jobs/${jobId}/reset-stale`
  );
  return response.data;
}

export async function backfillContentAssetDerivativeJobs(
  payload: ContentAssetProcessingJobBackfillPayload = {}
): Promise<ContentAssetProcessingJobBackfillResponse> {
  const response = await apiClient.post<ContentAssetProcessingJobBackfillResponse>(
    `${BASE_PATH}/processing-jobs/backfill-derivatives`,
    payload
  );
  return response.data;
}

export async function backfillContentAssetAiJobs(
  payload: ContentAssetAiJobBackfillPayload
): Promise<ContentAssetAiJobBackfillResponse> {
  const response = await apiClient.post<ContentAssetAiJobBackfillResponse>(
    `${BASE_PATH}/processing-jobs/backfill-ai`,
    payload
  );
  return response.data;
}

export async function createContentAssetAnalysisJob(
  assetId: string,
  payload: ContentAssetAnalysisJobCreatePayload
): Promise<ContentAssetProcessingJob> {
  const response = await apiClient.post<ContentAssetProcessingJob>(
    `${BASE_PATH}/assets/${assetId}/analysis-jobs`,
    payload
  );
  return response.data;
}

export async function createContentAssetTranscriptJob(
  assetId: string,
  payload: ContentAssetTranscriptJobCreatePayload
): Promise<ContentAssetProcessingJob> {
  const response = await apiClient.post<ContentAssetProcessingJob>(
    `${BASE_PATH}/assets/${assetId}/transcript-jobs`,
    payload
  );
  return response.data;
}

export async function fetchContentAssetDetail(
  assetId: string,
  options?: { signal?: AbortSignal }
): Promise<ContentAssetDetailResponse> {
  const response = await apiClient.get<ContentAssetDetailResponse>(`${BASE_PATH}/assets/${assetId}`, {
    signal: options?.signal,
  });
  return response.data;
}

export async function fetchContentAssetPerformanceDaily(
  assetId: string,
  query: ContentAssetPerformanceDailyQueryParams = {},
  options?: { signal?: AbortSignal }
): Promise<ContentAssetPerformanceDailyResponse> {
  const response = await apiClient.get<ContentAssetPerformanceDailyResponse>(
    `${BASE_PATH}/assets/${assetId}/performance/daily`,
    {
      params: {
        ...(query.materialId?.trim() ? { materialId: query.materialId.trim() } : {}),
        ...(query.objective?.trim() ? { objective: query.objective.trim() } : {}),
        ...(query.startDate?.trim() ? { startDate: query.startDate.trim() } : {}),
        ...(query.endDate?.trim() ? { endDate: query.endDate.trim() } : {}),
      },
      signal: options?.signal,
    }
  );
  return response.data;
}

export async function fetchContentAssetAnalysisResult(
  assetId: string,
  objectKey?: string | null,
  options?: { signal?: AbortSignal }
): Promise<ContentAssetAnalysisResultResponse> {
  const response = await apiClient.get<ContentAssetAnalysisResultResponse>(
    `${BASE_PATH}/assets/${assetId}/analysis-result`,
    {
      params: objectKey ? { objectKey } : undefined,
      signal: options?.signal,
    }
  );
  return response.data;
}

export async function createContentAssetPlaybackUrl(
  assetId: string,
  variant: PlaybackVariant
): Promise<PlaybackUrlResponse> {
  const response = await apiClient.post<PlaybackUrlResponse>(
    `${BASE_PATH}/assets/${assetId}/playback-url`,
    { variant }
  );
  return response.data;
}

export async function resolveContentAssetDouyinVideoId(
  payload: ContentAssetDouyinVideoIdResolvePayload
): Promise<ContentAssetDouyinVideoIdResolveResponse> {
  const response = await apiClient.post<ContentAssetDouyinVideoIdResolveResponse>(
    `${BASE_PATH}/douyin-video-id/resolve`,
    payload
  );
  return response.data;
}

export async function previewContentAssetVideoLink(
  payload: ContentAssetVideoLinkPreviewPayload
): Promise<ContentAssetVideoLinkPreviewResponse> {
  const response = await apiClient.post<ContentAssetVideoLinkPreviewResponse>(
    `${BASE_PATH}/video-link/preview`,
    payload
  );
  return response.data;
}

export async function importContentAssetFromVideoLink(
  payload: ContentAssetVideoLinkImportPayload
): Promise<ContentAssetVideoLinkImportResponse> {
  const response = await apiClient.post<ContentAssetVideoLinkImportResponse>(
    `${BASE_PATH}/video-link/import`,
    payload
  );
  return response.data;
}

export async function createContentAssetUpload(
  payload: ContentAssetUploadCreatePayload
): Promise<ContentAssetUploadCreateResponse> {
  const response = await apiClient.post<ContentAssetUploadCreateResponse>(`${BASE_PATH}/uploads`, payload);
  return response.data;
}

export async function createContentAssetSourceUpload(
  assetId: string,
  payload: ContentAssetUploadCreatePayload
): Promise<ContentAssetUploadCreateResponse> {
  const response = await apiClient.post<ContentAssetUploadCreateResponse>(
    `${BASE_PATH}/assets/${assetId}/source-upload`,
    payload
  );
  return response.data;
}

export async function completeContentAssetUpload(
  assetId: string,
  payload: ContentAssetUploadCompletePayload
): Promise<ContentAssetDetailResponse> {
  const response = await apiClient.post<ContentAssetDetailResponse>(
    `${BASE_PATH}/uploads/${assetId}/complete`,
    payload
  );
  return response.data;
}

export async function updateContentAssetProfile(
  assetId: string,
  payload: ContentAssetProfileUpdatePayload
): Promise<ContentAssetDetailResponse> {
  const response = await apiClient.patch<ContentAssetDetailResponse>(`${BASE_PATH}/assets/${assetId}`, payload);
  return response.data;
}

export async function createContentAssetPlatformVideo(
  assetId: string,
  payload: ContentAssetPlatformVideoCreatePayload
): Promise<ContentAssetDetailResponse> {
  const response = await apiClient.post<ContentAssetDetailResponse>(
    `${BASE_PATH}/assets/${assetId}/platform-videos`,
    payload
  );
  return response.data;
}

export async function updateContentAssetPlatformVideo(
  assetId: string,
  platformVideoId: string,
  payload: ContentAssetPlatformVideoUpdatePayload
): Promise<ContentAssetDetailResponse> {
  const response = await apiClient.patch<ContentAssetDetailResponse>(
    `${BASE_PATH}/assets/${assetId}/platform-videos/${platformVideoId}`,
    payload
  );
  return response.data;
}

export async function createContentAssetAdMaterial(
  assetId: string,
  payload: ContentAssetAdMaterialCreatePayload
): Promise<ContentAssetDetailResponse> {
  const response = await apiClient.post<ContentAssetDetailResponse>(
    `${BASE_PATH}/assets/${assetId}/ad-materials`,
    payload
  );
  return response.data;
}

export async function updateContentAssetAdMaterial(
  assetId: string,
  adMaterialId: string,
  payload: ContentAssetAdMaterialUpdatePayload
): Promise<ContentAssetDetailResponse> {
  const response = await apiClient.patch<ContentAssetDetailResponse>(
    `${BASE_PATH}/assets/${assetId}/ad-materials/${adMaterialId}`,
    payload
  );
  return response.data;
}

export async function createContentAssetImportRun(
  payload: ImportRunCreatePayload
): Promise<ImportRunCreateResponse> {
  const response = await apiClient.post<ImportRunCreateResponse>(`${BASE_PATH}/import-runs`, payload);
  return response.data;
}
