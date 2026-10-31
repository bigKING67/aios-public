import {
  Alert,
  Button,
  Empty,
  Pagination,
  Segmented,
  Table,
  Tooltip,
  type TableColumnsType,
} from '@lobehub/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bot, ImageIcon, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { ContentAssetsGrid, ContentAssetsSkeleton } from '@/app/marketing/content-assets/_components/content-assets-asset-list';
import { fetchContentAssets } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { resolveContentAssetDisplayTitle, resolveContentAssetProductText } from '@/app/marketing/content-assets/_lib/content-assets-display';
import { formatDuration } from '@/app/marketing/content-assets/_lib/content-assets-formatters';
import { contentAssetsQueryKeys } from '@/app/marketing/content-assets/_lib/content-assets-query-keys';
import type { ContentAssetItem, ContentAssetQueryParams } from '@/app/marketing/content-assets/_lib/content-assets-types';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { ASSET_ANNOTATION_OPTIONS, readAnnotationFilter, resolveAnnotationPills } from '../_lib/asset-annotation';
import { buildSegmentAnnotationPath } from '../_lib/segment-routes';
import { SELLING_POINT_PRESET_KEY } from '../_lib/segment-display';
import { isLongOptionList, studioProductOptions } from '../_lib/studio-products';
import pageStyles from '../ai-studio.module.css';
import { AnnotationPillText } from './annotation-pill-text';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { StudioSearch } from './studio-search';
import viewStyles from './ai-studio-assets-view.module.css';
import styles from './segment-annotation.module.css';
import { StudioUploadModal } from './studio-upload-modal';
import { useAssetAnnotationSummaries } from './use-asset-annotation-summaries';

const PAGE_SIZE = 20;
type AssetView = 'grid' | 'table';

function readPage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function hasProduct(asset: ContentAssetItem): boolean {
  const product = resolveContentAssetProductText(asset);
  return Boolean(product && product !== '--');
}

/**
 * Read-only view over library assets; it never copies asset records.
 * `enterpriseTag` limits the list to one enterprise's originals (the API
 * enforces the same scope on every studio write).
 */
export function AiStudioAssetsView({
  enterpriseTag = null,
  products = [],
  canUpload = false,
}: {
  enterpriseTag?: string | null;
  /** Enterprise product catalog (filter and upload choices). */
  products?: readonly string[];
  /** The asset library's upload permission. */
  canUpload?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const annotationPreset = searchParams.get('presetKey') === SELLING_POINT_PRESET_KEY ? SELLING_POINT_PRESET_KEY : undefined;
  const keyword = searchParams.get('keyword') ?? '';
  const productName = searchParams.get('productName') ?? '';
  const segmentStatus = readAnnotationFilter(searchParams.get('segmentStatus'));
  const view: AssetView = searchParams.get('view') === 'table' ? 'table' : 'grid';
  // The test originals (整片-001…005) stay out of 原片 until asked for; official originals come from 视频云管家.
  const showTestSamples = searchParams.get('testSamples') === 'show';
  const page = readPage(searchParams.get('page'));
  const productOptions = studioProductOptions(products);

  const query: ContentAssetQueryParams = {
    page,
    pageSize: PAGE_SIZE,
    sort: 'updated_desc',
    keyword: keyword || undefined,
    productName: productName || undefined,
    segmentStatus,
    // 原片 lists originals only; studio outputs live on 成片.
    studioOutputs: 'exclude',
    testSamples: showTestSamples ? undefined : 'exclude',
    tags: enterpriseTag ? [enterpriseTag] : undefined,
  };
  const assetsQuery = useQuery({
    queryKey: contentAssetsQueryKeys.list(query),
    queryFn: ({ signal }) => fetchContentAssets(query, { signal }),
    placeholderData: keepPreviousData,
  });
  const items = useMemo(() => assetsQuery.data?.items ?? [], [assetsQuery.data]);
  // Every listed original carries the enterprise tag, so its chip on each card is noise here.
  const cardItems = useMemo(
    () => (enterpriseTag ? items.map((asset) => ({ ...asset, tags: asset.tags.filter((tag) => tag !== enterpriseTag) })) : items),
    [items, enterpriseTag],
  );
  const assetIds = useMemo(() => items.map((asset) => asset.assetId), [items]);
  const { summaries, query: summariesQuery } = useAssetAnnotationSummaries(assetIds);
  const pillsFor = (asset: ContentAssetItem) => resolveAnnotationPills(summaries.get(asset.assetId), hasProduct(asset));

  const update = (changes: Record<string, string | undefined>) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!('page' in changes)) next.delete('page');
      return next;
    }, { replace: true });
  };
  const annotationPath = (asset: ContentAssetItem) => buildSegmentAnnotationPath(asset.assetId, undefined, annotationPreset, 'assets');
  const openAnnotation = (asset: ContentAssetItem) => navigate(annotationPath(asset));

  const columns: TableColumnsType<ContentAssetItem> = [
    {
      title: '原片',
      key: 'title',
      render: (_, asset) => (
        <div className={styles.assetCell}>
          {asset.coverUrl ? (
            <img className={styles.assetCover} src={asset.coverUrl} alt="" loading="lazy" />
          ) : (
            <span className={styles.assetCoverEmpty} aria-hidden="true">
              <ImageIcon size={16} strokeWidth={1.8} />
            </span>
          )}
          <span className={styles.assetTitle}>{resolveContentAssetDisplayTitle(asset)}</span>
        </div>
      ),
    },
    {
      title: '标注',
      key: 'annotation',
      render: (_, asset) => (
        <AnnotationPillText pills={pillsFor(asset)} />
      ),
    },
    { title: '产品', key: 'product', render: (_, asset) => resolveContentAssetProductText(asset) || '--' },
    { title: '时长', key: 'duration', render: (_, asset) => <span className={styles.mono}>{formatDuration(asset.durationSeconds)}</span> },
    {
      title: '操作',
      key: 'actions',
      render: (_, asset) => (
        <div className={styles.rowActions}>
          <RouterLink className={styles.tableLink} to={annotationPath(asset)}>标注片段</RouterLink>
        </div>
      ),
    },
  ];

  const total = assetsQuery.data?.total ?? 0;
  const isInitialLoading = assetsQuery.isPending;
  const isEmpty = !assetsQuery.isError && !isInitialLoading && items.length === 0;

  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">原片</h1>
          <p>点击原片人工标注，或用 AI 切段自动切分。</p>
        </div>
        <div className={viewStyles.headerActions}>
          <RouterLink className={styles.secondaryLink} to={ROUTE_PATHS.contentAiStudioAnalysis}>
            <Bot size={14} strokeWidth={1.8} aria-hidden="true" />
            AI 切段
          </RouterLink>
          {canUpload ? (
            <Button type="primary" icon={<Upload size={14} strokeWidth={1.8} aria-hidden="true" />} onClick={() => setUploading(true)}>
              上传原片
            </Button>
          ) : (
            <Tooltip title="需要素材上传权限，请联系管理员开通">
              <Button type="primary" icon={<Upload size={14} strokeWidth={1.8} aria-hidden="true" />} disabled>
                上传原片
              </Button>
            </Tooltip>
          )}
        </div>
      </header>
      <StudioUploadModal open={uploading} onClose={() => setUploading(false)} enterpriseTag={enterpriseTag} products={products} />

      <article className={`${pageStyles.card} ${viewStyles.surface}`} aria-label="原片列表">
        <div className={viewStyles.toolbar}>
          <div className={styles.filterBar} role="search" aria-label="原片筛选">
            <StudioSearch
              key={keyword}
              label="搜索原片"
              placeholder="搜索标题、达人或备注"
              defaultValue={keyword}
              onSearch={(value) => update({ keyword: value || undefined })}
            />
            <LabeledSelect
              label="标注状态"
              wrapperClassName={styles.filterSelect}
              value={segmentStatus ?? ''}
              options={ASSET_ANNOTATION_OPTIONS}
              onChange={(value) => update({ segmentStatus: typeof value === 'string' && value ? value : undefined })}
            />
            <LabeledSelect
              label="产品"
              wrapperClassName={styles.filterSelect}
              showSearch={isLongOptionList(productOptions)}
              value={productName}
              options={[{ value: '', label: '全部产品' }, ...productOptions]}
              onChange={(value) => update({ productName: typeof value === 'string' && value ? value : undefined })}
            />
          </div>
          <div role="group" aria-label="视图">
            <Segmented<AssetView>
              value={view}
              options={[
                { label: '卡片', value: 'grid' },
                { label: '表格', value: 'table' },
              ]}
              onChange={(value) => update({ view: value === 'table' ? 'table' : undefined, page: page > 1 ? String(page) : undefined })}
            />
          </div>
        </div>
        <p className={viewStyles.meta}>
          共 {assetsQuery.isError ? '--' : total} 条 · 混剪按产品组合片段，未绑定产品的原片请在标注时为片段填写产品。
          <Button
            type="link"
            size="small"
            className={viewStyles.metaToggle}
            aria-pressed={showTestSamples}
            onClick={() => update({ testSamples: showTestSamples ? undefined : 'show' })}
          >
            {showTestSamples ? '隐藏测试样片' : '显示测试样片'}
          </Button>
        </p>

        {assetsQuery.isError ? (
          <Alert
            type="error"
            showIcon
            title="原片列表读取失败"
            description={assetsQuery.error instanceof Error ? assetsQuery.error.message : '请求失败'}
            action={<Button onClick={() => void assetsQuery.refetch()}>重试</Button>}
          />
        ) : null}
        {summariesQuery.isError ? (
          <Alert type="warning" showIcon title="标注状态读取失败，卡片暂不显示片段数量" action={<Button size="small" onClick={() => void summariesQuery.refetch()}>重试</Button>} />
        ) : null}
        {isInitialLoading ? <ContentAssetsSkeleton /> : null}
        {isEmpty ? (
          <Empty
            description={
              showTestSamples
                ? enterpriseTag
                  ? `没有符合条件的原片。AI 创作中心只显示带「${enterpriseTag}」标签的原片。`
                  : '没有符合条件的原片。可调整筛选，或先上传原片。'
                : '没有符合条件的原片。正式原片将从视频云管家接入；测试样片已隐藏，可点上方「显示测试样片」查看。'
            }
          />
        ) : null}
        {items.length > 0 && view === 'grid' ? (
          <ContentAssetsGrid
            items={cardItems}
            processingJobs={[]}
            onOpen={openAnnotation}
            resolvePills={pillsFor}
            openLabel="标注片段"
          />
        ) : null}
        {items.length > 0 && view === 'table' ? (
          <div className={styles.tableScroll}>
            <Table<ContentAssetItem>
              rowKey="assetId"
              size="small"
              loading={assetsQuery.isFetching}
              columns={columns}
              dataSource={items}
              pagination={false}
              scroll={{ x: 900 }}
            />
          </div>
        ) : null}
        {!assetsQuery.isError && total > PAGE_SIZE ? (
          <div className={viewStyles.pagination}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              showTotal={(count) => `共 ${count} 条`}
              onChange={(next) => update({ page: next > 1 ? String(next) : undefined })}
            />
          </div>
        ) : null}
      </article>
    </section>
  );
}
