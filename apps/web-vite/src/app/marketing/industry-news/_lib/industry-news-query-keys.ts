import type { IndustryArticleQueryParams } from './industry-news-types';

export const industryNewsQueryKeys = {
  root: ['marketing', 'industry-news'] as const,
  lists: () => [...industryNewsQueryKeys.root, 'list'] as const,
  list: (query: IndustryArticleQueryParams) =>
    [...industryNewsQueryKeys.lists(), query] as const,
  sources: () => [...industryNewsQueryKeys.root, 'sources'] as const,
};
