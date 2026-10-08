import { FileImageOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Empty, Input, Pagination, Segmented, Select, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { ContentAssetsGrid, ContentAssetsSkeleton } from '@/app/marketing/content-assets/_components/content-assets-asset-list';
import { fetchContentAssets } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { resolveContentAssetDisplayTitle, resolveContentAssetProductText } from '@/app/marketing/content-assets/_lib/content-assets-display';
import { formatDuration } from '@/app/marketing/content-assets/_lib/content-assets-formatters';
import { contentAssetsQueryKeys } from '@/app/marketing/content-assets/_lib/content-assets-query-keys';
import type { ContentAssetItem, ContentAssetQueryParams } from '@/app/marketing/content-assets/_lib/content-assets-types';
import {
  contentAssetVideoTypeLabel,
  resolveContentAssetVideoTypeOptions,
} from '@/app/marketing/content-assets/_lib/content-assets-ui-helpers';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { ASSET_ANNOTATION_OPTIONS, readAnnotationFilter, resolveAnnotationPills } from '../_lib/asset-annotation';
import { buildContentAssetDetailPath } from '../_lib/remix-routes';
import { buildSegmentAnnotationPath } from '../_lib/segment-routes';
import { studioProductOptions } from '../_lib/studio-products';
import pageStyles from '../ai-studio.module.css';
import { AnnotationPillText } from './annotation-pill-text';
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
  const keyword = searchParams.get('keyword') ?? '';
  const productName = searchParams.get('productName') ?? '';
  const videoType = searchParams.get('videoType') ?? '';
  const segmentStatus = readAnnotationFilter(searchParams.get('segmentStatus'));
  const view: AssetView = searchParams.get('view') === 'table' ? 'table' : 'grid';
  const includeOutputs = searchParams.get('outputs') === 'include';
  const page = readPage(searchParams.get('page'));

  const query: ContentAssetQueryParams = {
    page,
    pageSize: PAGE_SIZE,
    sort: 'updated_desc',
    keyword: keyword || undefined,
    productName: productName || undefined,
    videoType: videoType || undefined,
    segmentStatus,
    studioOutputs: includeOutputs ? undefined : 'exclude',
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
  const openAnnotation = (asset: ContentAssetItem) => navigate(buildSegmentAnnotationPath(asset.assetId));

  const columns: ColumnsType<ContentAssetItem> = [
    {
      title: '原片',
      key: 'title',
      render: (_, asset) => (
        <div className={styles.assetCell}>
          {asset.coverUrl ? (
            <img className={styles.assetCover} src={asset.coverUrl} alt="" loading="lazy" />
          ) : (
            <span className={styles.assetCoverEmpty} aria-hidden><FileImageOutlined /></span>
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
    { title: '类型', key: 'type', render: (_, asset) => contentAssetVideoTypeLabel(asset.videoType) },
    { title: '时长', key: 'duration', render: (_, asset) => <span className={styles.mono}>{formatDuration(asset.durationSeconds)}</span> },
    {
      title: '操作',
      key: 'actions',
      render: (_, asset) => (
        <div className={styles.rowActions}>
          <RouterLink className={styles.tableLink} to={buildSegmentAnnotationPath(asset.assetId)}>标注片段</RouterLink>
          <RouterLink className={styles.tableLink} to={buildContentAssetDetailPath(asset.assetId)}>
            在素材库打开
          </RouterLink>
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
          <p>直接使用素材库里的原片，授权和信息同步、不复制；点击原片进入片段标注。</p>
        </div>
        <div className={viewStyles.headerActions}>
          <RouterLink className={styles.secondaryLink} to={ROUTE_PATHS.marketingContentAssets}>前往素材库</RouterLink>
          {canUpload ? (
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploading(true)}>上传原片</Button>
          ) : (
            <Tooltip title="需要素材上传权限，请联系管理员开通">
              <Button type="primary" icon={<UploadOutlined />} disabled>上传原片</Button>
            </Tooltip>
          )}
        </div>
      </header>
      <StudioUploadModal open={uploading} onClose={() => setUploading(false)} enterpriseTag={enterpriseTag} products={products} />

      <article className={pageStyles.card}>
        <div className={styles.filterBar} role="search" aria-label="原片筛选">
          <Input.Search
            key={keyword}
            aria-label="搜索原片"
            enterButton={<Button aria-label="搜索" icon={<SearchOutlined aria-hidden />} />}
            placeholder="搜索标题、达人或备注"
            defaultValue={keyword}
            allowClear
            onSearch={(value) => update({ keyword: value.trim() || undefined })}
          />
          <Select
            aria-label="标注状态"
            value={segmentStatus ?? ''}
            options={ASSET_ANNOTATION_OPTIONS}
            onChange={(value: string) => update({ segmentStatus: value || undefined })}
          />
          <Select
            aria-label="产品"
            showSearch
            value={productName}
            options={[{ value: '', label: '全部产品' }, ...studioProductOptions(products)]}
            onChange={(value: string) => update({ productName: value || undefined })}
          />
          <Select
            aria-label="类型"
            value={videoType}
            options={[{ value: '', label: '全部类型' }, ...resolveContentAssetVideoTypeOptions(assetsQuery.data?.filterOptions.videoTypes)]}
            onChange={(value: string) => update({ videoType: value || undefined })}
          />
        </div>
      </article>

      <article className={`${pageStyles.card} ${viewStyles.surface}`} aria-label="原片列表">
        <div className={viewStyles.surfaceHeader}>
          <div>
            <h2>全部原片</h2>
            <p>共 {assetsQuery.isError ? '--' : total} 条。混剪按产品组合片段，未绑定产品的原片请在标注时为片段填写产品。</p>
          </div>
          <div className={viewStyles.surfaceTools}>
            <Checkbox
              checked={includeOutputs}
              onChange={(event) => update({ outputs: event.target.checked ? 'include' : undefined })}
            >
              包含混剪成片
            </Checkbox>
            <Segmented<AssetView>
              aria-label="视图"
              value={view}
              options={[
                { label: '卡片', value: 'grid' },
                { label: '表格', value: 'table' },
              ]}
              onChange={(value) => update({ view: value === 'table' ? 'table' : undefined, page: page > 1 ? String(page) : undefined })}
            />
          </div>
        </div>

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
              enterpriseTag
                ? `没有符合条件的原片。AI 创作中心只显示带「${enterpriseTag}」标签的原片，可在素材库为原片添加该标签。`
                : '没有符合条件的原片。可调整筛选，或先在素材库上传原片。'
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
