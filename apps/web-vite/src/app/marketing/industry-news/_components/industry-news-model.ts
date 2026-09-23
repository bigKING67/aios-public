import type { Dayjs } from 'dayjs';
import { resolveClientErrorMessage, resolveClientErrorStatus } from '@/lib/client-error';
import type {
  IndustryArticleSort,
  IndustryArticleSummary,
} from '../_lib/industry-news-types';

export type FeedDensity = 'comfortable' | 'compact';
export type DateRangeValue = [Dayjs | null, Dayjs | null] | null;

export const SORT_OPTIONS: Array<{ label: string; value: IndustryArticleSort }> = [
  { label: '最新发布', value: 'publish_time_desc' },
  { label: '最新同步', value: 'fetched_at_desc' },
  { label: '按来源聚合', value: 'source_publish_time_desc' },
  { label: '相关优先', value: 'relevance' },
];

export function createEmptySummary(): IndustryArticleSummary {
  return {
    totalArticles: 0,
    todayArticles: 0,
    contentFetchedArticles: 0,
    listOnlyArticles: 0,
    failedContentArticles: 0,
    sourceCount: 0,
    failedSourceCount: 0,
    latestPublishTime: null,
    latestFetchedAt: null,
    wechatLoginExpiresAt: null,
    wechatLoginStatus: null,
  };
}

export function resolveWechatStatusLabel(status: string): string {
  switch (status) {
    case 'ok':
      return '正常';
    case 'expired':
      return '已过期';
    case 'unavailable':
      return '不可用';
    default:
      return '未知';
  }
}

export function resolveIndustryNewsErrorDescription(error: unknown): string {
  const status = resolveClientErrorStatus(error);
  if (status === 404) {
    return '当前后端尚未加载行业资讯接口，请重启后端服务或部署最新版本。';
  }
  if (status === 500) {
    return '服务器已命中行业资讯接口，但数据库表可能尚未迁移，请确认 ads.marketing_industry_articles 已创建。';
  }
  return resolveClientErrorMessage(error, '请确认后端接口、数据库迁移和文章同步任务已完成。');
}
