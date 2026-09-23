'use client';

import { useCallback, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  Pagination,
  Select,
  Segmented,
  Spin,
} from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  fetchIndustryArticleSources,
  fetchIndustryArticles,
} from '../_lib/industry-news-api';
import {
  formatCompactNumber,
  formatRelativeFromNow,
} from '../_lib/industry-news-formatters';
import { industryNewsQueryKeys } from '../_lib/industry-news-query-keys';
import type {
  IndustryArticleItem,
  IndustryArticleQueryParams,
  IndustryArticleSort,
} from '../_lib/industry-news-types';
import styles from '../industry-news.module.css';
import {
  ArticleDrawer,
  ArticleListItem,
  MetricStrip,
  SourcePanel,
  WechatStatusPanel,
} from './industry-news-panels';
import {
  SORT_OPTIONS,
  createEmptySummary,
  resolveIndustryNewsErrorDescription,
  type DateRangeValue,
  type FeedDensity,
} from './industry-news-model';

const { RangePicker } = DatePicker;

export function IndustryNewsClient() {
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sourceFakeid, setSourceFakeid] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<DateRangeValue>(null);
  const [sort, setSort] = useState<IndustryArticleSort>('publish_time_desc');
  const [density, setDensity] = useState<FeedDensity>('comfortable');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeArticle, setActiveArticle] = useState<IndustryArticleItem | null>(null);

  const queryParams = useMemo<IndustryArticleQueryParams>(
    () => ({
      keyword,
      sourceFakeid,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      page,
      pageSize,
      sort,
    }),
    [dateRange, keyword, page, pageSize, sort, sourceFakeid]
  );

  const { data, error, isFetching, isLoading, isPlaceholderData, refetch } = useQuery({
    queryKey: industryNewsQueryKeys.list(queryParams),
    queryFn: ({ signal }) => fetchIndustryArticles(queryParams, { signal }),
    placeholderData: keepPreviousData,
  });

  const {
    data: sourceData,
    error: sourceError,
    isFetching: isSourcesFetching,
    isLoading: isSourcesLoading,
  } = useQuery({
    queryKey: industryNewsQueryKeys.sources(),
    queryFn: fetchIndustryArticleSources,
    staleTime: 5 * 60 * 1000,
  });

  const summary = data?.summary ?? createEmptySummary();
  const sources = useMemo(
    () => data?.sources ?? sourceData ?? [],
    [data?.sources, sourceData]
  );
  const items = data?.items ?? [];
  const isRefreshingResult = isFetching && isPlaceholderData;
  const showLoadingSurface = (isLoading && !data) || isRefreshingResult;
  const visibleItems = isRefreshingResult ? [] : items;
  const resultCountLabel = showLoadingSurface
    ? '正在加载当前筛选结果'
    : `当前命中 ${formatCompactNumber(data?.total ?? 0)} 篇`;
  const toolbarHint = showLoadingSurface
    ? '正在加载当前筛选结果，完成后自动更新列表'
    : `共 ${formatCompactNumber(data?.total ?? 0)} 篇可读正文，最近同步 ${formatRelativeFromNow(summary.latestFetchedAt)}`;

  const sourceOptions = useMemo(
    () =>
      sources.map((source) => ({
        label: source.nickname || source.alias || source.sourceFakeid,
        value: source.sourceFakeid,
      })),
    [sources]
  );
  const activeSourceName = useMemo(() => {
    if (!sourceFakeid) {
      return undefined;
    }
    const selectedSource = sources.find((source) => source.sourceFakeid === sourceFakeid);
    return selectedSource?.nickname || selectedSource?.alias || sourceFakeid;
  }, [sourceFakeid, sources]);
  const activeFilterItems = useMemo(() => {
    const nextItems: Array<{ label: string; value: string }> = [];
    const dateFrom = dateRange?.[0]?.format('YYYY-MM-DD');
    const dateTo = dateRange?.[1]?.format('YYYY-MM-DD');
    const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? sort;

    if (keyword) {
      nextItems.push({ label: '关键词', value: keyword });
    }
    if (activeSourceName) {
      nextItems.push({ label: '来源', value: activeSourceName });
    }
    if (dateFrom || dateTo) {
      nextItems.push({ label: '日期', value: `${dateFrom ?? '不限'} - ${dateTo ?? '不限'}` });
    }
    if (sort !== 'publish_time_desc') {
      nextItems.push({ label: '排序', value: sortLabel });
    }

    return nextItems;
  }, [activeSourceName, dateRange, keyword, sort]);
  const trimmedKeywordInput = keywordInput.trim();
  const hasPendingKeywordChange = trimmedKeywordInput !== keyword;
  const pendingKeywordLabel = trimmedKeywordInput
    ? `已输入「${trimmedKeywordInput}」，点击搜索后生效`
    : '已清空关键词，点击搜索后生效';
  const isInitialListError = !!error && !data;
  const sourcePanelLoading = sources.length === 0 && (isSourcesLoading || isSourcesFetching);
  const sourcePanelError = sources.length === 0 && !!sourceError;
  const sourcePanelStaleError = sources.length > 0 && !!sourceError;

  const applySearch = () => {
    setKeyword(keywordInput.trim());
    setPage(1);
  };

  const resetFilters = () => {
    setKeywordInput('');
    setKeyword('');
    setSourceFakeid(undefined);
    setDateRange(null);
    setSort('publish_time_desc');
    setPage(1);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      applySearch();
    }
  };
  const handleOpenArticle = useCallback((item: IndustryArticleItem) => {
    setActiveArticle(item);
  }, []);

  return (
    <ProtectedRoute>
      <Layout>
        <main className={styles.pageShell}>
          <section className={styles.overviewPanel}>
            <section className={styles.heroPanel}>
              <div className={styles.heroCopy}>
                <h1>行业资讯</h1>
                <p>
                  汇总已订阅公众号文章，按来源、发布时间、正文抓取状态组织成可检索资讯流，供营销策略和内容判断使用。
                </p>
              </div>
              <Link to={ROUTE_PATHS.marketing} className={styles.backLink}>
                <ArrowLeftOutlined />
                返回营销总览
              </Link>
            </section>

            <MetricStrip summary={summary} />
            <WechatStatusPanel summary={summary} />
          </section>

          <section className={styles.filterPanel}>
            <div className={styles.filterRow}>
              <Input
                allowClear
                aria-label="搜索行业资讯文章"
                prefix={<SearchOutlined />}
                placeholder="搜索标题、摘要或正文"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              <Select
                allowClear
                aria-label="筛选公众号来源"
                showSearch
                placeholder="公众号来源"
                optionFilterProp="label"
                options={sourceOptions}
                value={sourceFakeid}
                onChange={(value) => {
                  setSourceFakeid(value);
                  setPage(1);
                }}
              />
              <RangePicker
                aria-label="筛选行业资讯发布日期范围"
                placeholder={['开始日期', '结束日期']}
                value={dateRange}
                onChange={(value) => {
                  setDateRange(value);
                  setPage(1);
                }}
              />
              <Select
                aria-label="排序行业资讯"
                options={SORT_OPTIONS}
                value={sort}
                onChange={(value) => {
                  setSort(value);
                  setPage(1);
                }}
              />
            </div>
            <div className={styles.filterActions}>
              <Segmented<FeedDensity>
                aria-label="切换资讯流阅读密度"
                value={density}
                onChange={setDensity}
                options={[
                  { label: '阅读视图', value: 'comfortable' },
                  { label: '紧凑视图', value: 'compact' },
                ]}
              />
              <div className={styles.filterActionButtons}>
                <Button onClick={resetFilters}>重置</Button>
                <Button type="primary" icon={<SearchOutlined />} onClick={applySearch}>
                  搜索
                </Button>
              </div>
            </div>
            <div className={styles.filterStateRow} aria-live="polite" aria-atomic="true">
              <div className={styles.filterStateMeta}>
                <span className={styles.filterStateLabel}>筛选状态</span>
                <span className={styles.filterStateCount}>{resultCountLabel}</span>
              </div>
              <div className={styles.filterChips} aria-label="当前筛选条件">
                {activeFilterItems.length > 0 ? (
                  activeFilterItems.map((filter) => (
                    <span key={filter.label} className={styles.filterChip}>
                      <span className={styles.filterChipLabel}>{filter.label}</span>
                      <span className={styles.filterChipValue}>{filter.value}</span>
                    </span>
                  ))
                ) : (
                  <span className={styles.filterEmptyState}>
                    全部来源 · 全部日期 · 最新发布
                  </span>
                )}
                {hasPendingKeywordChange ? (
                  <span className={styles.filterPendingState}>
                    {pendingKeywordLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {error ? (
            <Alert
              type="error"
              showIcon
              message="行业资讯加载失败"
              description={resolveIndustryNewsErrorDescription(error)}
            />
          ) : null}

          <section className={styles.contentGrid}>
            <section className={styles.feedPanel} aria-busy={showLoadingSurface}>
              <div className={styles.feedToolbar}>
                <div className={styles.toolbarMeta}>
                  <h2 className={styles.toolbarTitle}>资讯流</h2>
                  <span className={styles.toolbarHint} aria-live="polite">
                    {toolbarHint}
                  </span>
                </div>
                <Button
                  icon={<ReloadOutlined />}
                  loading={isFetching}
                  onClick={() => refetch()}
                >
                  刷新
                </Button>
              </div>

              {showLoadingSurface ? (
                <div className={styles.loadingSurface}>
                  <Spin />
                  <span className={styles.loadingText}>正在加载当前筛选结果</span>
                </div>
              ) : null}

              {!isInitialListError && !showLoadingSurface && visibleItems.length === 0 ? (
                <div className={styles.emptySurface}>
                  <Empty description="暂无匹配文章，请调整关键词、来源或日期后重试">
                    <Button type="link" onClick={resetFilters}>
                      清空筛选
                    </Button>
                  </Empty>
                </div>
              ) : null}

              {visibleItems.length > 0 ? (
                <div className={styles.articleList}>
                  {visibleItems.map((item) => (
                    <ArticleListItem
                      key={item.id}
                      item={item}
                      density={density}
                      onOpen={handleOpenArticle}
                    />
                  ))}
                </div>
              ) : null}

              {!isInitialListError && !showLoadingSurface ? (
                <div className={styles.paginationWrap}>
                  <Pagination
                    current={page}
                    pageSize={pageSize}
                    total={data?.total ?? 0}
                    showSizeChanger
                    showTotal={(total) => `共 ${formatCompactNumber(total)} 篇`}
                    onChange={(nextPage, nextPageSize) => {
                      setPage(nextPageSize !== pageSize ? 1 : nextPage);
                      setPageSize(nextPageSize);
                    }}
                  />
                </div>
              ) : null}
            </section>

            <SourcePanel
              sources={sources}
              loading={sourcePanelLoading}
              error={sourcePanelError}
              staleError={sourcePanelStaleError}
              selectedSourceFakeid={sourceFakeid}
              onSelectSource={(nextSourceFakeid) => {
                setSourceFakeid(nextSourceFakeid);
                setPage(1);
              }}
            />
          </section>
        </main>

        <ArticleDrawer
          item={activeArticle}
          open={!!activeArticle}
          onClose={() => setActiveArticle(null)}
        />
      </Layout>
    </ProtectedRoute>
  );
}
