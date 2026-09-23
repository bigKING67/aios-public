import { request } from '@/lib/request';
import {
  AIOS_API_PATHS,
  type IndustryMaterialBrandAiBackfillRequest as ApiIndustryMaterialBrandAiBackfillRequest,
  type IndustryMaterialBrandAiBackfillResponse as ApiIndustryMaterialBrandAiBackfillResponse,
  type IndustryMaterialInspirationResponse as ApiIndustryMaterialInspirationResponse,
} from '@/lib/generated-api-contract';
import {
  normalizeIndustryMaterialBrandAiBackfillResponse,
  normalizeIndustryMaterialResponse,
} from './industry-material-inspiration-api';
import type {
  IndustryMaterialBrandAiBackfillPayload,
  IndustryMaterialBrandAiBackfillResponse,
  IndustryMaterialResponse,
  IndustryMaterialTab,
} from './industry-material-inspiration-types';

const DASHBOARD_ENDPOINT = AIOS_API_PATHS.industryMaterialInspiration;
const BRAND_AI_BACKFILL_ENDPOINT = `${DASHBOARD_ENDPOINT}/brand-ai-analysis/backfill`;

export interface FetchIndustryMaterialInspirationParams {
  tab: IndustryMaterialTab;
  month?: string | null;
  brand?: string | null;
  signal?: AbortSignal;
}

export async function fetchIndustryMaterialInspiration({
  tab,
  month,
  brand,
  signal,
}: FetchIndustryMaterialInspirationParams): Promise<IndustryMaterialResponse> {
  const params: Record<string, string> = { tab };
  if (month) {
    params.month = month;
  }
  if (brand && brand !== 'all') {
    params.brand = brand;
  }
  const response = await request.get<ApiIndustryMaterialInspirationResponse>(DASHBOARD_ENDPOINT, {
    params,
    signal,
    cancelPrevious: true,
    requestKey: `dashboard-industry-material-inspiration:${tab}:${month ?? 'latest'}:${brand ?? 'all'}`,
  });
  return normalizeIndustryMaterialResponse(response);
}

export async function backfillIndustryMaterialBrandAiAnalysis(
  payload: IndustryMaterialBrandAiBackfillPayload
): Promise<IndustryMaterialBrandAiBackfillResponse> {
  const apiPayload: ApiIndustryMaterialBrandAiBackfillRequest = payload;
  const response = await request.post<ApiIndustryMaterialBrandAiBackfillResponse>(
    BRAND_AI_BACKFILL_ENDPOINT,
    apiPayload,
    {
      requestKey: `dashboard-industry-material-brand-ai-backfill:${payload.tab}:${payload.month}:${payload.brand}`,
      retryMode: 'never',
      timeout: 120_000,
    },
  );
  return normalizeIndustryMaterialBrandAiBackfillResponse(response);
}
