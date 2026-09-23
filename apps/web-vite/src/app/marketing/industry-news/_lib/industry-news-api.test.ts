import { describe, expect, it } from 'vitest';

import type { IndustryNewsArticleListResponse } from '@/lib/generated-api-contract';
import {
  buildIndustryArticleParams,
  normalizeIndustryArticleListResponse,
} from './industry-news-api';

function articleResponse(contentStatus: string): IndustryNewsArticleListResponse {
  return {
    items: [{
      id: 1,
      sourceFakeid: 'source-1',
      sourceNickname: 'Source',
      sourceAlias: 'source',
      aid: 'article-1',
      title: 'Title',
      digest: 'Digest',
      articleUrl: 'https://example.invalid/article-1',
      coverUrl: '',
      author: 'Author',
      publishTime: null,
      publishDate: null,
      plainContent: 'Content',
      contentStatus,
      contentFetchError: null,
      fetchSource: 'fixture',
      imageCount: 0,
      fetchedAt: '2026-07-23T00:00:00Z',
      updatedAt: '2026-07-23T00:00:00Z',
    }],
    total: 1,
    page: 1,
    pageSize: 20,
    summary: {
      totalArticles: 1,
      todayArticles: 0,
      contentFetchedArticles: 1,
      listOnlyArticles: 0,
      failedContentArticles: 0,
      sourceCount: 1,
      failedSourceCount: 0,
      latestPublishTime: null,
      latestFetchedAt: null,
      wechatLoginExpiresAt: null,
      wechatLoginStatus: null,
    },
    sources: [],
  };
}

describe('industry news API contract', () => {
  it('maps UI filters to the validated backend query names', () => {
    expect(buildIndustryArticleParams({
      keyword: '  serum  ',
      sourceFakeid: 'source-1',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-23',
      contentStatus: 'content_fetched',
      hasContent: true,
      page: 2,
      pageSize: 50,
      sort: 'relevance',
    })).toEqual({
      keyword: 'serum',
      source_fakeid: 'source-1',
      date_from: '2026-07-01',
      date_to: '2026-07-23',
      content_status: 'content_fetched',
      has_content: 'true',
      page: 2,
      page_size: 50,
      sort: 'relevance',
    });
  });

  it('accepts the closed article content-status domain', () => {
    expect(normalizeIndustryArticleListResponse(articleResponse('content_fetched')))
      .toMatchObject({ items: [{ contentStatus: 'content_fetched' }] });
  });

  it('fails closed on an unexpected article content status', () => {
    expect(() => normalizeIndustryArticleListResponse(articleResponse('unexpected')))
      .toThrow('Unsupported industry article content status: unexpected');
  });
});
