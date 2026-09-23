import { apiClient } from "@/lib/api-client";
import {
  AIOS_API_PATHS,
  type ArchiveSampleInventorySampleRequest,
  type BatchArchiveSampleInventorySamplesRequest,
  type BatchArchiveSampleInventoryOutboundRequest,
  type BatchEditSampleInventoryOutboundRequest,
  type BatchTransitionSampleInventoryOutboundRequest,
  type BatchUpdateSampleInventoryOutboundTrackingRequest,
  type BatchVoidSampleInventoryInboundsRequest,
  type CreateSampleInventoryInboundBatchRequest,
  type CreateSampleInventoryInboundRequest,
  type CreateSampleInventoryOutboundBatchRequest,
  type CreateSampleInventoryOutboundRequest,
  type CreateSampleInventorySampleRequest,
  type ImportSampleInventoryInboundsRequest,
  type ImportSampleInventorySamplesRequest,
  type ParseSampleInventoryBackupRequest,
  type RestoreSampleInventoryBackupRequest,
  type SampleInventoryAdjustmentRequest,
  type SampleInventoryAccessPolicy,
  type SampleInventoryBackupFile,
  type SampleInventoryBackupPlanResponse,
  type SampleInventoryBackupRestoreResponse,
  type SampleInventoryBatchMutationResponse,
  type SampleInventoryInbound,
  type SampleInventoryInboundBatchMutationResponse,
  type SampleInventoryInboundBatchResponse,
  type SampleInventoryInboundListResponse,
  type SampleInventoryInboundXlsxParseResponse,
  type SampleInventoryOutbound,
  type SampleInventoryOutboundBatchResponse,
  type SampleInventoryOutboundListResponse,
  type SampleInventorySample,
  type SampleInventorySampleBatchMutationResponse,
  type SampleInventorySampleImportResponse,
  type SampleInventorySampleListResponse,
  type SampleInventorySampleXlsxParseResponse,
  type SampleInventorySettings,
  type SampleInventorySummary,
  type TransitionSampleInventoryOutboundRequest,
  type UpdateSampleInventoryOutboundRequest,
  type UpdateSampleInventoryOutboundTrackingRequest,
  type UpdateSampleInventorySampleRequest,
  type UpdateSampleInventorySettingsRequest,
  type VoidSampleInventoryInboundRequest,
} from "@/lib/generated-api-contract";
import type {
  SampleInventoryInboundQuery,
  SampleInventoryOutboundListView,
  SampleInventoryOutboundQuery,
  SampleInventorySampleQuery,
} from "./sample-inventory-types";
import { normalizeOutboundStatus } from "./sample-inventory-types";

function compactParams(
  values: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== "",
    ),
  );
}

export async function fetchSampleInventoryAccessPolicy(): Promise<SampleInventoryAccessPolicy> {
  const response = await apiClient.get<SampleInventoryAccessPolicy>(AIOS_API_PATHS.sampleInventoryAccessPolicy);
  return response.data;
}

export async function fetchSampleInventoryBackup(): Promise<SampleInventoryBackupFile> {
  const response = await apiClient.get<SampleInventoryBackupFile>(AIOS_API_PATHS.sampleInventoryBackup);
  return response.data;
}

export async function parseSampleInventoryBackup(
  payload: ParseSampleInventoryBackupRequest,
): Promise<SampleInventoryBackupPlanResponse> {
  const response = await apiClient.post<SampleInventoryBackupPlanResponse>(
    AIOS_API_PATHS.sampleInventoryBackupParse,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function restoreSampleInventoryBackup(
  payload: RestoreSampleInventoryBackupRequest,
): Promise<SampleInventoryBackupRestoreResponse> {
  const response = await apiClient.post<SampleInventoryBackupRestoreResponse>(
    AIOS_API_PATHS.sampleInventoryBackupRestore,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function fetchSampleInventorySettings(): Promise<SampleInventorySettings> {
  const response = await apiClient.get<SampleInventorySettings>(AIOS_API_PATHS.sampleInventorySettings);
  return response.data;
}

export async function fetchSampleInventorySummary(signal?: AbortSignal): Promise<SampleInventorySummary> {
  const response = await apiClient.get<SampleInventorySummary>(AIOS_API_PATHS.sampleInventorySummary, { signal });
  return response.data;
}

export async function updateSampleInventorySettings(
  payload: UpdateSampleInventorySettingsRequest,
): Promise<SampleInventorySettings> {
  const response = await apiClient.patch<SampleInventorySettings>(AIOS_API_PATHS.sampleInventorySettings, payload, {
    retryMode: "never",
  });
  return response.data;
}

export async function fetchSampleInventorySamples(
  query: SampleInventorySampleQuery,
  signal?: AbortSignal,
): Promise<SampleInventorySampleListResponse> {
  const response = await apiClient.get<SampleInventorySampleListResponse>(AIOS_API_PATHS.sampleInventorySamples, {
    params: compactParams({
      keyword: query.keyword,
      include_archived: query.includeArchived,
      stockStatus: query.stockStatus,
      productKind: query.productKind,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      page_size: query.pageSize,
    }),
    signal,
  });
  return response.data;
}

export async function createSampleInventorySample(
  payload: CreateSampleInventorySampleRequest,
): Promise<SampleInventorySample> {
  const response = await apiClient.post<SampleInventorySample>(AIOS_API_PATHS.sampleInventorySamples, payload, {
    retryMode: "never",
  });
  return response.data;
}

export async function updateSampleInventorySample(
  sampleId: number,
  payload: UpdateSampleInventorySampleRequest,
): Promise<SampleInventorySample> {
  const response = await apiClient.patch<SampleInventorySample>(
    AIOS_API_PATHS.sampleInventorySample(sampleId),
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function adjustSampleInventorySample(
  sampleId: number,
  payload: SampleInventoryAdjustmentRequest,
): Promise<SampleInventorySample> {
  const response = await apiClient.post<SampleInventorySample>(
    AIOS_API_PATHS.sampleInventorySampleAdjustment(sampleId),
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function archiveSampleInventorySample(
  sampleId: number,
  payload: ArchiveSampleInventorySampleRequest,
): Promise<SampleInventorySample> {
  const response = await apiClient.post<SampleInventorySample>(
    AIOS_API_PATHS.sampleInventorySampleArchive(sampleId),
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function batchArchiveSampleInventorySamples(
  payload: BatchArchiveSampleInventorySamplesRequest,
): Promise<SampleInventorySampleBatchMutationResponse> {
  const response = await apiClient.post<SampleInventorySampleBatchMutationResponse>(
    AIOS_API_PATHS.sampleInventorySampleBatchArchive,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function parseSampleInventorySampleXlsx(file: File): Promise<SampleInventorySampleXlsxParseResponse> {
  const body = new FormData();
  body.append("file", file);
  const response = await apiClient.post<SampleInventorySampleXlsxParseResponse>(
    AIOS_API_PATHS.sampleInventorySampleParseXlsx,
    body,
    { retryMode: "never" },
  );
  return response.data;
}

export async function importSampleInventorySamples(
  payload: ImportSampleInventorySamplesRequest,
): Promise<SampleInventorySampleImportResponse> {
  const response = await apiClient.post<SampleInventorySampleImportResponse>(
    AIOS_API_PATHS.sampleInventorySampleImport,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function fetchSampleInventoryInbounds(
  query: SampleInventoryInboundQuery,
  signal?: AbortSignal,
): Promise<SampleInventoryInboundListResponse> {
  const response = await apiClient.get<SampleInventoryInboundListResponse>(AIOS_API_PATHS.sampleInventoryInbounds, {
    params: compactParams({
      keyword: query.keyword,
      sample_id: query.sampleId,
      include_voided: query.includeVoided,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      page_size: query.pageSize,
    }),
    signal,
  });
  return response.data;
}

export async function createSampleInventoryInbound(
  payload: CreateSampleInventoryInboundRequest,
): Promise<SampleInventoryInbound> {
  const response = await apiClient.post<SampleInventoryInbound>(AIOS_API_PATHS.sampleInventoryInbounds, payload, {
    retryMode: "never",
  });
  return response.data;
}

export async function createSampleInventoryInboundBatch(
  payload: CreateSampleInventoryInboundBatchRequest,
): Promise<SampleInventoryInboundBatchResponse> {
  const response = await apiClient.post<SampleInventoryInboundBatchResponse>(
    AIOS_API_PATHS.sampleInventoryInboundBatch,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function voidSampleInventoryInbound(
  inboundId: number,
  payload: VoidSampleInventoryInboundRequest,
): Promise<SampleInventoryInbound> {
  const response = await apiClient.post<SampleInventoryInbound>(
    AIOS_API_PATHS.sampleInventoryInboundVoid(inboundId),
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function batchVoidSampleInventoryInbounds(
  payload: BatchVoidSampleInventoryInboundsRequest,
): Promise<SampleInventoryInboundBatchMutationResponse> {
  const response = await apiClient.post<SampleInventoryInboundBatchMutationResponse>(
    AIOS_API_PATHS.sampleInventoryInboundBatchVoid,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function parseSampleInventoryInboundXlsx(file: File): Promise<SampleInventoryInboundXlsxParseResponse> {
  const body = new FormData();
  body.append("file", file);
  const response = await apiClient.post<SampleInventoryInboundXlsxParseResponse>(
    AIOS_API_PATHS.sampleInventoryInboundParseXlsx,
    body,
    { retryMode: "never" },
  );
  return response.data;
}

export async function importSampleInventoryInbounds(
  payload: ImportSampleInventoryInboundsRequest,
): Promise<SampleInventoryInboundBatchResponse> {
  const response = await apiClient.post<SampleInventoryInboundBatchResponse>(
    AIOS_API_PATHS.sampleInventoryInboundImport,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function fetchSampleInventoryOutbounds(
  query: SampleInventoryOutboundQuery,
  signal?: AbortSignal,
): Promise<SampleInventoryOutboundListView> {
  const response = await apiClient.get<SampleInventoryOutboundListResponse>(
    AIOS_API_PATHS.sampleInventoryOutbounds,
    {
      params: compactParams({
        keyword: query.keyword,
        status: query.status,
        sample_id: query.sampleId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        page: query.page,
        page_size: query.pageSize,
      }),
      signal,
    },
  );
  return {
    ...response.data,
    items: response.data.items.map((item) => ({
      ...item,
      status: normalizeOutboundStatus(item.status),
    })),
  };
}

export async function createSampleInventoryOutbound(
  payload: CreateSampleInventoryOutboundRequest,
): Promise<SampleInventoryOutbound> {
  const response = await apiClient.post<SampleInventoryOutbound>(AIOS_API_PATHS.sampleInventoryOutbounds, payload, {
    retryMode: "never",
  });
  return response.data;
}

export async function createSampleInventoryOutboundBatch(
  payload: CreateSampleInventoryOutboundBatchRequest,
): Promise<SampleInventoryOutboundBatchResponse> {
  const response = await apiClient.post<SampleInventoryOutboundBatchResponse>(
    AIOS_API_PATHS.sampleInventoryOutboundBatch,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function updateSampleInventoryOutbound(
  requestId: number,
  payload: UpdateSampleInventoryOutboundRequest,
): Promise<SampleInventoryOutbound> {
  const response = await apiClient.patch<SampleInventoryOutbound>(
    AIOS_API_PATHS.sampleInventoryOutbound(requestId),
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function updateSampleInventoryOutboundTracking(
  requestId: number,
  payload: UpdateSampleInventoryOutboundTrackingRequest,
): Promise<SampleInventoryOutbound> {
  const response = await apiClient.patch<SampleInventoryOutbound>(
    AIOS_API_PATHS.sampleInventoryOutboundTracking(requestId),
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function batchUpdateSampleInventoryOutboundTracking(
  payload: BatchUpdateSampleInventoryOutboundTrackingRequest,
): Promise<SampleInventoryBatchMutationResponse> {
  const response = await apiClient.patch<SampleInventoryBatchMutationResponse>(
    AIOS_API_PATHS.sampleInventoryOutboundBatchTracking,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function transitionSampleInventoryOutbound(
  requestId: number,
  payload: TransitionSampleInventoryOutboundRequest,
): Promise<SampleInventoryOutbound> {
  const response = await apiClient.post<SampleInventoryOutbound>(
    AIOS_API_PATHS.sampleInventoryOutboundTransition(requestId),
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function batchTransitionSampleInventoryOutbounds(
  payload: BatchTransitionSampleInventoryOutboundRequest,
): Promise<SampleInventoryBatchMutationResponse> {
  const response = await apiClient.post<SampleInventoryBatchMutationResponse>(
    AIOS_API_PATHS.sampleInventoryOutboundBatchTransition,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function batchEditSampleInventoryOutbounds(
  payload: BatchEditSampleInventoryOutboundRequest,
): Promise<SampleInventoryBatchMutationResponse> {
  const response = await apiClient.post<SampleInventoryBatchMutationResponse>(
    AIOS_API_PATHS.sampleInventoryOutboundBatchEdit,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function batchArchiveSampleInventoryOutbounds(
  payload: BatchArchiveSampleInventoryOutboundRequest,
): Promise<SampleInventoryBatchMutationResponse> {
  const response = await apiClient.post<SampleInventoryBatchMutationResponse>(
    AIOS_API_PATHS.sampleInventoryOutboundBatchArchive,
    payload,
    { retryMode: "never" },
  );
  return response.data;
}

export async function downloadSampleInventoryFile(path: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(path, { responseType: "blob" });
  return response.data;
}

export function downloadSampleInventorySampleTemplate(): Promise<Blob> {
  return downloadSampleInventoryFile(AIOS_API_PATHS.sampleInventorySampleTemplate);
}

export function downloadSampleInventorySampleExport(): Promise<Blob> {
  return downloadSampleInventoryFile(AIOS_API_PATHS.sampleInventorySampleExport);
}

export function downloadSampleInventoryInboundTemplate(): Promise<Blob> {
  return downloadSampleInventoryFile(AIOS_API_PATHS.sampleInventoryInboundTemplate);
}

export function downloadSampleInventoryInboundExport(): Promise<Blob> {
  return downloadSampleInventoryFile(AIOS_API_PATHS.sampleInventoryInboundExport);
}

export function downloadSampleInventoryOutboundExport(): Promise<Blob> {
  return downloadSampleInventoryFile(AIOS_API_PATHS.sampleInventoryOutboundExport);
}
