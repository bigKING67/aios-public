import type {
  IndustryNewsArticleItem as ApiIndustryArticleItem,
  IndustryNewsArticleListResponse as ApiIndustryArticleListResponse,
  IndustryNewsArticleSource as ApiIndustryArticleSource,
  IndustryNewsArticleSummary as ApiIndustryArticleSummary,
} from '@/lib/generated-api-contract';

export type IndustryArticleSort =
  | 'publish_time_desc'
  | 'fetched_at_desc'
  | 'source_publish_time_desc'
  | 'relevance';

export type IndustryArticleContentStatus =
  | 'list_only'
  | 'content_fetched'
  | 'content_failed';

export interface IndustryArticleQueryParams {
  keyword?: string;
  sourceFakeid?: string;
  dateFrom?: string;
  dateTo?: string;
  contentStatus?: IndustryArticleContentStatus;
  hasContent?: boolean;
  page: number;
  pageSize: number;
  sort: IndustryArticleSort;
}

export interface IndustryArticleItem extends Omit<ApiIndustryArticleItem, 'contentStatus'> {
  contentStatus: IndustryArticleContentStatus;
}

export type IndustryArticleSource = ApiIndustryArticleSource;

export type IndustryArticleSummary = ApiIndustryArticleSummary;

export interface IndustryArticleListResponse extends Omit<ApiIndustryArticleListResponse, 'items'> {
  items: IndustryArticleItem[];
}
