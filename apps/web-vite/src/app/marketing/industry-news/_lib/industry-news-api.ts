import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type IndustryNewsArticleListResponse as ApiIndustryArticleListResponse,
  type IndustryNewsArticleSourcesResponse,
} from '@/lib/generated-api-contract';
import type {
  IndustryArticleContentStatus,
  IndustryArticleListResponse,
  IndustryArticleQueryParams,
  IndustryArticleSource,
} from './industry-news-types';

const INDUSTRY_ARTICLE_CONTENT_STATUSES = new Set<IndustryArticleContentStatus>([
  'list_only',
  'content_fetched',
  'content_failed',
]);

function normalizeIndustryArticleContentStatus(value: string): IndustryArticleContentStatus {
  if (INDUSTRY_ARTICLE_CONTENT_STATUSES.has(value as IndustryArticleContentStatus)) {
    return value as IndustryArticleContentStatus;
  }
  throw new Error(`Unsupported industry article content status: ${value}`);
}

export function normalizeIndustryArticleListResponse(
  response: ApiIndustryArticleListResponse,
): IndustryArticleListResponse {
  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      contentStatus: normalizeIndustryArticleContentStatus(item.contentStatus),
    })),
  };
}

export function buildIndustryArticleParams(
  query: IndustryArticleQueryParams
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {
    page: query.page,
    page_size: query.pageSize,
    sort: query.sort,
  };

  const keyword = query.keyword?.trim();
  if (keyword) params.keyword = keyword;
  if (query.sourceFakeid) params.source_fakeid = query.sourceFakeid;
  if (query.dateFrom) params.date_from = query.dateFrom;
  if (query.dateTo) params.date_to = query.dateTo;
  if (query.contentStatus) params.content_status = query.contentStatus;
  if (query.hasContent !== undefined) params.has_content = String(query.hasContent);

  return params;
}

export async function fetchIndustryArticles(
  query: IndustryArticleQueryParams,
  options?: { signal?: AbortSignal }
): Promise<IndustryArticleListResponse> {
  const response = await apiClient.get<ApiIndustryArticleListResponse>(
    AIOS_API_PATHS.industryNewsArticles,
    {
      params: buildIndustryArticleParams(query),
      signal: options?.signal,
    },
  );
  return normalizeIndustryArticleListResponse(response.data);
}

export async function fetchIndustryArticleSources(): Promise<IndustryArticleSource[]> {
  const response = await apiClient.get<IndustryNewsArticleSourcesResponse>(
    AIOS_API_PATHS.industryNewsSources,
  );
  return response.data;
}
