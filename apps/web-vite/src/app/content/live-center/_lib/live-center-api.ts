import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type LiveCenterAnalysisJob as ApiLiveCenterAnalysisJob,
  type LiveCenterRecordingSegment as ApiLiveCenterRecordingSegment,
  type LiveCenterSessionDetailResponse as ApiLiveCenterSessionDetailResponse,
} from '@/lib/generated-api-contract';
import type {
  LiveCenterAnalysisCreatePayload,
  LiveCenterAnalysisJob,
  LiveCenterDateBoundsResponse,
  LiveCenterRecordingMultipartResumePayload,
  LiveCenterRecordingMultipartResumeResponse,
  LiveCenterPlaybackUrlResponse,
  LiveCenterRecordingSegment,
  LiveCenterRecordingSegmentCleanupResponse,
  LiveCenterRecordingUploadCompletePayload,
  LiveCenterRecordingUploadCreatePayload,
  LiveCenterRecordingUploadCreateResponse,
  LiveCenterSessionDetailResponse,
  LiveCenterSessionListResponse,
  LiveCenterSessionQueryParams,
} from './live-center-types';

const BASE_PATH = AIOS_API_PATHS.liveCenter;

export async function fetchLiveCenterDateBounds(
  options?: { signal?: AbortSignal }
): Promise<LiveCenterDateBoundsResponse> {
  const response = await apiClient.get<LiveCenterDateBoundsResponse>(
    AIOS_API_PATHS.liveCenterDateBounds,
    { signal: options?.signal },
  );
  return response.data;
}

export function buildLiveCenterSessionParams(
  query: LiveCenterSessionQueryParams
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page: query.page,
    pageSize: query.pageSize,
  };

  const keyword = query.keyword?.trim();
  const shopId = query.shopId?.trim();
  const anchorDouyinId = query.anchorDouyinId?.trim();

  if (keyword) params.keyword = keyword;
  if (shopId) params.shopId = shopId;
  if (anchorDouyinId) params.anchorDouyinId = anchorDouyinId;
  if (query.startDate) params.startDate = query.startDate;
  if (query.endDate) params.endDate = query.endDate;

  return params;
}

export async function fetchLiveCenterSessions(
  query: LiveCenterSessionQueryParams,
  options?: { signal?: AbortSignal }
): Promise<LiveCenterSessionListResponse> {
  const response = await apiClient.get<LiveCenterSessionListResponse>(
    AIOS_API_PATHS.liveCenterSessions,
    {
      params: buildLiveCenterSessionParams(query),
      signal: options?.signal,
    },
  );
  return response.data;
}

export async function fetchLiveCenterSessionDetail(
  sessionId: string,
  options?: { signal?: AbortSignal }
): Promise<LiveCenterSessionDetailResponse> {
  const encodedSessionId = encodeURIComponent(sessionId);
  const response = await apiClient.get<ApiLiveCenterSessionDetailResponse>(
    `${AIOS_API_PATHS.liveCenterSessions}/${encodedSessionId}`,
    {
      signal: options?.signal,
    }
  );
  return response.data;
}

export async function createLiveCenterRecordingUpload(
  sessionId: string,
  payload: LiveCenterRecordingUploadCreatePayload
): Promise<LiveCenterRecordingUploadCreateResponse> {
  const encodedSessionId = encodeURIComponent(sessionId);
  const response = await apiClient.post<LiveCenterRecordingUploadCreateResponse>(
    `${BASE_PATH}/sessions/${encodedSessionId}/recordings/uploads`,
    payload
  );
  return response.data;
}

export async function completeLiveCenterRecordingSegment(
  recordingId: string,
  segmentId: string,
  payload: LiveCenterRecordingUploadCompletePayload
): Promise<LiveCenterRecordingSegment> {
  const response = await apiClient.post<ApiLiveCenterRecordingSegment>(
    `${BASE_PATH}/recordings/${encodeURIComponent(recordingId)}/segments/${encodeURIComponent(segmentId)}/complete`,
    payload
  );
  return response.data;
}

export async function resumeLiveCenterRecordingMultipartUpload(
  recordingId: string,
  segmentId: string,
  payload: LiveCenterRecordingMultipartResumePayload
): Promise<LiveCenterRecordingMultipartResumeResponse> {
  const response = await apiClient.post<LiveCenterRecordingMultipartResumeResponse>(
    `${BASE_PATH}/recordings/${encodeURIComponent(recordingId)}/segments/${encodeURIComponent(segmentId)}/multipart/resume`,
    payload
  );
  return response.data;
}

export async function createLiveCenterPlaybackUrl(
  recordingId: string,
  segmentId: string
): Promise<LiveCenterPlaybackUrlResponse> {
  const response = await apiClient.post<LiveCenterPlaybackUrlResponse>(
    `${BASE_PATH}/recordings/${encodeURIComponent(recordingId)}/segments/${encodeURIComponent(segmentId)}/playback-url`
  );
  return response.data;
}

export async function cleanupLiveCenterRecordingSegment(
  recordingId: string,
  segmentId: string
): Promise<LiveCenterRecordingSegmentCleanupResponse> {
  const response = await apiClient.post<LiveCenterRecordingSegmentCleanupResponse>(
    `${BASE_PATH}/recordings/${encodeURIComponent(recordingId)}/segments/${encodeURIComponent(segmentId)}/cleanup`
  );
  return response.data;
}

export async function createLiveCenterAnalysisJob(
  sessionId: string,
  payload: LiveCenterAnalysisCreatePayload = {}
): Promise<LiveCenterAnalysisJob> {
  const encodedSessionId = encodeURIComponent(sessionId);
  const response = await apiClient.post<ApiLiveCenterAnalysisJob>(
    `${BASE_PATH}/sessions/${encodedSessionId}/analysis`,
    payload
  );
  return response.data;
}
