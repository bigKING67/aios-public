import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type CreatorLibraryFilterOptions as ApiCreatorLibraryFilterOptions,
  type CreatorLibraryFollowLogListResponse as ApiCreatorLibraryFollowLogListResponse,
  type CreatorLibraryItem as ApiCreatorLibraryItem,
  type CreatorLibraryListResponse as ApiCreatorLibraryListResponse,
  type CreatorLibraryXlsxParseResponse,
} from '@/lib/generated-api-contract';
import type {
  CreatorLibraryDetailResponse,
  CreatorLibraryFilterOptions,
  CreatorLibraryFollowLogPayload,
  CreatorLibraryFollowLogResponse,
  CreatorLibraryFollowLogsResponse,
  CreatorLibraryImportResponse,
  CreatorLibraryItem,
  CreatorLibraryListResponse,
  CreatorLibraryPayload,
  CreatorLibraryQueryParams,
} from './creator-library-types';

const BASE_PATH = AIOS_API_PATHS.creatorLibrary;

const CREATOR_LIBRARY_OWNERSHIP_TYPES = new Set<CreatorLibraryItem['ownershipType']>([
  'public_seed',
  'owned',
  'bd_owned',
]);

export function normalizeCreatorLibraryOwnershipType(
  value: string,
): CreatorLibraryItem['ownershipType'] {
  if (CREATOR_LIBRARY_OWNERSHIP_TYPES.has(value as CreatorLibraryItem['ownershipType'])) {
    return value as CreatorLibraryItem['ownershipType'];
  }
  throw new Error(`Unsupported creator library ownership type: ${value}`);
}

function normalizeCreatorLibraryItem(item: ApiCreatorLibraryItem): CreatorLibraryItem {
  return {
    ...item,
    ownershipType: normalizeCreatorLibraryOwnershipType(item.ownershipType),
  };
}

function normalizeCreatorLibraryListResponse(
  response: ApiCreatorLibraryListResponse,
): CreatorLibraryListResponse {
  return {
    ...response,
    items: response.items.map(normalizeCreatorLibraryItem),
  };
}

interface CreatorLibraryParamOptions {
  includeFilterOptions?: boolean;
  includeSummary?: boolean;
}

export function buildCreatorLibraryParams(
  query: CreatorLibraryQueryParams,
  options: CreatorLibraryParamOptions = {}
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page: query.page,
    page_size: query.pageSize,
    sort: query.sort,
  };

  if (query.keyword) params.keyword = query.keyword;
  if (query.platform) params.platform = query.platform;
  if (query.category) params.category = query.category;
  if (query.anchorTags?.length) params.anchor_tags = query.anchorTags.filter(Boolean).join(',');
  if (query.fansBand) params.fans_band = query.fansBand;
  if (query.anchorLevel) params.anchor_level = query.anchorLevel;
  if (query.cooperationStatus) params.cooperation_status = query.cooperationStatus;
  if (query.ownerUserId) params.owner_user_id = query.ownerUserId;
  else if (query.ownerName) params.owner_name = query.ownerName;
  if (query.lastFollowRange) params.last_follow_range = query.lastFollowRange;
  if (query.isCooperable) params.is_cooperable = query.isCooperable;
  if (query.sourceType) params.source_type = query.sourceType;
  if (query.ownershipScope) params.ownership = query.ownershipScope;
  if (query.mcnStatus) params.mcn_status = query.mcnStatus;
  if (options.includeFilterOptions !== undefined) {
    params.include_filter_options = String(options.includeFilterOptions);
  }
  if (options.includeSummary !== undefined) {
    params.include_summary = String(options.includeSummary);
  }

  return params;
}

export async function fetchCreatorLibrary(
  query: CreatorLibraryQueryParams,
  options?: { signal?: AbortSignal }
): Promise<CreatorLibraryListResponse> {
  const response = await apiClient.get<ApiCreatorLibraryListResponse>(BASE_PATH, {
    params: buildCreatorLibraryParams(query, {
      includeFilterOptions: false,
      includeSummary: false,
    }),
    signal: options?.signal,
  });
  return normalizeCreatorLibraryListResponse(response.data);
}

export async function fetchCreatorLibraryFilterOptions(): Promise<CreatorLibraryFilterOptions> {
  const response = await apiClient.get<ApiCreatorLibraryFilterOptions>(`${BASE_PATH}/filter-options`);
  return response.data;
}

export async function createCreator(payload: CreatorLibraryPayload) {
  const response = await apiClient.post<CreatorLibraryDetailResponse>(BASE_PATH, payload);
  return response.data.item;
}

export async function updateCreator(id: number, payload: CreatorLibraryPayload) {
  const response = await apiClient.put<CreatorLibraryDetailResponse>(`${BASE_PATH}/${id}`, payload);
  return response.data.item;
}

export async function deleteCreator(
  id: number,
  expectedUpdatedAt?: string | null
): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${id}`, {
    headers: expectedUpdatedAt
      ? { 'X-Expected-Updated-At': expectedUpdatedAt }
      : undefined,
  });
}

export async function fetchCreatorFollowLogs(
  creatorId: number
): Promise<CreatorLibraryFollowLogsResponse> {
  const response = await apiClient.get<ApiCreatorLibraryFollowLogListResponse>(
    `${BASE_PATH}/${creatorId}/follow-logs`
  );
  return response.data;
}

export async function createCreatorFollowLog(
  creatorId: number,
  payload: CreatorLibraryFollowLogPayload
) {
  const response = await apiClient.post<CreatorLibraryFollowLogResponse>(
    `${BASE_PATH}/${creatorId}/follow-logs`,
    payload
  );
  return response.data.item;
}

export async function updateCreatorFollowLog(
  creatorId: number,
  logId: number,
  payload: CreatorLibraryFollowLogPayload
) {
  const response = await apiClient.patch<CreatorLibraryFollowLogResponse>(
    `${BASE_PATH}/${creatorId}/follow-logs/${logId}`,
    payload
  );
  return response.data.item;
}

export async function deleteCreatorFollowLog(
  creatorId: number,
  logId: number,
  expectedUpdatedAt?: string | null
): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${creatorId}/follow-logs/${logId}`, {
    headers: expectedUpdatedAt
      ? { 'X-Expected-Updated-At': expectedUpdatedAt }
      : undefined,
  });
}

export async function importCreators(rows: CreatorLibraryPayload[]): Promise<CreatorLibraryImportResponse> {
  const response = await apiClient.post<CreatorLibraryImportResponse>(`${BASE_PATH}/import`, { rows });
  return response.data;
}

export async function parseCreatorLibraryXlsxFile(file: File): Promise<string[][]> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<CreatorLibraryXlsxParseResponse>(
    AIOS_API_PATHS.creatorLibraryParseXlsx,
    formData,
    { retryMode: 'never' },
  );
  return response.data.rows;
}

export async function downloadCreatorLibraryTemplate(): Promise<Blob> {
  const response = await apiClient.get<Blob>(`${BASE_PATH}/template.xlsx`, {
    responseType: 'blob',
  });
  return response.data;
}

export async function exportCreatorLibraryCsv(query: CreatorLibraryQueryParams): Promise<string> {
  const response = await apiClient.get<string>(`${BASE_PATH}/export.csv`, {
    params: buildCreatorLibraryParams(query),
    responseType: 'text',
  });
  return response.data;
}
