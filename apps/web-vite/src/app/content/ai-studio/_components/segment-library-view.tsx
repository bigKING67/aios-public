import { useInfiniteQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Segmented, Select } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ContentAssetsSkeleton } from '@/app/marketing/content-assets/_components/content-assets-asset-list';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  aiStudioQueryKeys,
  fetchStudioSegments,
  type StudioContentSegmentListQuery,
  type StudioSegmentOrigin,
  type StudioSegmentPreset,
  type StudioSegmentStatus,
} from '../_lib/ai-studio-api';
import {
  isSegmentReadOnly,
  presetDisplayName,
  SEGMENT_ORIGIN_OPTIONS,
  SEGMENT_STATUS_OPTIONS,
} from '../_lib/segment-display';
import type { PoolScope } from '../_lib/segment-pool';
import { studioProductOptions } from '../_lib/studio-products';
import type { SegmentKind } from '../_lib/segment-routes';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import { SegmentCard } from './segment-card';
import libraryStyles from './segment-library.module.css';
import { SegmentLabelStrip } from './segment-label-strip';
import { SegmentLibraryBulkBar } from './segment-library-bulk-bar';
import { SegmentLibraryTable } from './segment-library-table';
import { useSegmentBulkActions, type BulkAction } from './use-segment-bulk-actions';
import { useSellingPointFrameNotes } from './use-selling-point-frame-notes';

const PAGE_SIZE = 50;
const STATUS_VALUES = new Set<string>(SEGMENT_STATUS_OPTIONS.map((option) => option.value));
const ORIGIN_VALUES = new Set<string>(SEGMENT_ORIGIN_OPTIONS.map((option) => option.value));
type SegmentView = 'grid' | 'table';
const DEFAULT_STATUS: StudioSegmentStatus = 'confirmed';
const ALL_STATUSES = 'all';

const KIND_COPY: Record<SegmentKind, { title: string; description: string }> = {
  framework: {
    title: '框架片段',
    description: '已确认、带产品的框架片段用于框架混剪；新建或调整片段请从原片进入标注。',
  },
  sellingPoint: {
    title: '卖点片段',
    description: '已确认的卖点片段用于卖点混剪，必须落在已确认的框架段内；新建或调整请从原片进入标注。',
  },
};

interface SegmentLibraryViewProps {
  kind: SegmentKind;
  presets: readonly StudioSegmentPreset[];
  /** Presets of this library's kind, for the preset switch. */
  kindPresets: readonly StudioSegmentPreset[];
  preset: StudioSegmentPreset;
  canWrite: boolean;
  /** Enterprise product catalog for the bulk and per-card product pickers. */
  products?: readonly string[];
}

export function SegmentLibraryView({ kind, presets, kindPresets, preset, canWrite, products }: SegmentLibraryViewProps) {
  const copy = KIND_COPY[kind];
  const [searchParams, setSearchParams] = useSearchParams();
  const labelKey = searchParams.get('labelKey') ?? '';
  const withoutProduct = searchParams.get('withoutProduct') === 'true';
  const productName = withoutProduct ? '' : searchParams.get('productName') ?? '';
  // The library shows usable (confirmed) segments by default; `status=all` lists every state.
  const statusParam = searchParams.get('status') ?? DEFAULT_STATUS;
  const status = STATUS_VALUES.has(statusParam) ? (statusParam as StudioSegmentStatus) : undefined;
  const originParam = searchParams.get('origin') ?? '';
  const origin = ORIGIN_VALUES.has(originParam) ? (originParam as StudioSegmentOrigin) : undefined;
  const view: SegmentView = searchParams.get('view') === 'table' ? 'table' : 'grid';
  const scope: PoolScope = withoutProduct
    ? { kind: 'withoutProduct' }
    : productName
      ? { kind: 'product', productName }
      : { kind: 'all' };

  const query: StudioContentSegmentListQuery = {
    presetKey: preset.presetKey,
    labelKey: labelKey || undefined,
    productName: productName || undefined,
    withoutProduct: withoutProduct || undefined,
    status,
    origin,
    limit: PAGE_SIZE,
  };
  const queryKey = aiStudioQueryKeys.segmentList(query);
  const segmentsQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => fetchStudioSegments({ ...query, cursor: pageParam }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const loaded = useMemo(() => segmentsQuery.data?.pages.flatMap((page) => page.items) ?? [], [segmentsQuery.data]);
  const covers = useMemo(
    () => new Map((segmentsQuery.data?.pages ?? []).flatMap((page) => page.assets ?? []).map((cover) => [cover.assetId, cover.coverUrl ?? null])),
    [segmentsQuery.data]
  );

  const { framesQuery, cardNotes } = useSellingPointFrameNotes(kind, loaded, presets);

  const bulk = useSegmentBulkActions(presets);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkProduct, setBulkProduct] = useState<string | undefined>();
  // Card checkboxes only exist in batch mode; the table view keeps its selection column.
  const [batchMode, setBatchMode] = useState(false);
  const filterKey = JSON.stringify(query);
  useEffect(() => setSelectedIds(new Set()), [filterKey]);
  const selected = loaded.filter((segment) => selectedIds.has(segment.segmentId) && !isSegmentReadOnly(segment));
  const setSelected = (segmentId: string, checked: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(segmentId);
      else next.delete(segmentId);
      return next;
    });
  const selectableLoaded = loaded.filter((segment) => !isSegmentReadOnly(segment));
  const exitBatch = () => {
    setBatchMode(false);
    setSelectedIds(new Set());
  };
  const runBulk = async (action: BulkAction) => {
    if (await bulk.run(action)) setSelectedIds(new Set());
  };

  const setFilters = (changes: Record<string, string | undefined>) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if ('presetKey' in changes) next.delete('labelKey');
      return next;
    }, { replace: true });
  };

  const activePresets = kindPresets.filter((item) => item.status === 'active');
  const productOptions = studioProductOptions(products);

  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <RouterLink className={pageStyles.actionLink} to={`${ROUTE_PATHS.contentAiStudioAssets}?presetKey=${encodeURIComponent(preset.presetKey)}`}>选择原片标注</RouterLink>
      </header>

      <article className={`${pageStyles.card} ${libraryStyles.libraryCard}`} aria-label="片段列表">
        <SegmentLabelStrip
          preset={preset}
          scope={scope}
          labelKey={labelKey}
          onScopeChange={(next) =>
            setFilters({
              productName: next.kind === 'product' ? next.productName : undefined,
              withoutProduct: next.kind === 'withoutProduct' ? 'true' : undefined,
            })
          }
          onLabelChange={(key) => setFilters({ labelKey: key || undefined })}
        />
        <div className={libraryStyles.toolbar} role="search" aria-label="片段筛选">
          <span className={libraryStyles.resultCount} aria-live="polite">
            {segmentsQuery.isSuccess ? `${loaded.length}${segmentsQuery.hasNextPage ? '+' : ''} 条` : ''}
          </span>
          <div className={libraryStyles.toolbarFilters}>
            {activePresets.length > 1 ? (
              <Select
                aria-label="分类预设"
                size="small"
                value={preset.presetKey}
                options={activePresets.map((item) => ({ value: item.presetKey, label: presetDisplayName(item) }))}
                onChange={(value: string) => setFilters({ presetKey: value })}
              />
            ) : null}
            <Select
              aria-label="状态"
              className={libraryStyles.toolbarSelect}
              value={status ?? ALL_STATUSES}
              options={[{ value: ALL_STATUSES, label: '全部状态' }, ...SEGMENT_STATUS_OPTIONS.map(({ value, label }) => ({ value, label }))]}
              onChange={(value: string) => setFilters({ status: value === DEFAULT_STATUS ? undefined : value })}
            />
            <Select
              aria-label="来源"
              className={libraryStyles.toolbarSelect}
              value={origin ?? ''}
              options={[{ value: '', label: '全部来源' }, ...SEGMENT_ORIGIN_OPTIONS]}
              onChange={(value: string) => setFilters({ origin: value || undefined })}
            />
            {canWrite && view === 'grid' ? (
              <Button
                type={batchMode ? 'primary' : 'default'}
                aria-pressed={batchMode}
                onClick={() => (batchMode ? exitBatch() : setBatchMode(true))}
              >
                {batchMode ? '完成' : '批量管理'}
              </Button>
            ) : null}
            <Segmented<SegmentView>
              aria-label="视图"
              value={view}
              options={[
                { label: '卡片', value: 'grid' },
                { label: '表格', value: 'table' },
              ]}
              onChange={(value) => {
                exitBatch();
                setFilters({ view: value === 'table' ? 'table' : undefined });
              }}
            />
          </div>
        </div>

        {bulk.notice ? (
          <Alert
            type={bulk.notice.tone === 'success' ? 'success' : 'error'}
            showIcon
            closable
            onClose={bulk.clearNotice}
            title={bulk.notice.tone === 'success' ? bulk.notice.text : bulk.notice.error.message}
          />
        ) : null}

        {canWrite && ((view === 'grid' && batchMode) || (view === 'table' && selected.length > 0)) ? (
          <SegmentLibraryBulkBar
            view={view}
            busy={bulk.busy}
            selected={selected}
            selectable={selectableLoaded}
            productOptions={productOptions}
            bulkProduct={bulkProduct}
            onBulkProductChange={setBulkProduct}
            onSelectedIdsChange={setSelectedIds}
            onRun={(action) => void runBulk(action)}
          />
        ) : null}

        {kind === 'sellingPoint' && framesQuery.isError ? (
          <Alert
            type="warning"
            showIcon
            title="框架段读取失败，卡片暂时不显示所在框架段"
            action={<Button onClick={() => void framesQuery.refetch()}>重试</Button>}
          />
        ) : null}
        {kind === 'sellingPoint' && framesQuery.data?.truncated ? (
          <p className={styles.fieldHelp}>框架段超过 1000 条，部分卡片不显示所在框架段。</p>
        ) : null}
        {segmentsQuery.isError ? (
          <Alert
            type="error"
            showIcon
            title="片段读取失败"
            description={segmentsQuery.error instanceof Error ? segmentsQuery.error.message : '请求失败'}
            action={<Button onClick={() => void segmentsQuery.refetch()}>重试</Button>}
          />
        ) : null}
        {segmentsQuery.isPending && view === 'grid' ? <ContentAssetsSkeleton /> : null}
        {segmentsQuery.isSuccess && loaded.length === 0 ? <Empty description="没有符合条件的片段。可从原片页选一条原片开始标注。" /> : null}
        {loaded.length > 0 && view === 'grid' ? (
          <div className={libraryStyles.segmentGrid}>
            {loaded.map((segment) => (
              <SegmentCard
                key={segment.segmentId}
                segment={segment}
                presets={presets}
                coverUrl={segment.coverUrl ?? covers.get(segment.assetId) ?? null}
                fallbackCoverUrl={covers.get(segment.assetId) ?? null}
                selected={selectedIds.has(segment.segmentId)}
                selectable={canWrite && batchMode}
                canWrite={canWrite}
                busy={bulk.busy}
                showStatus={status !== 'confirmed'}
                productOptions={productOptions}
                notes={cardNotes(segment)}
                onSelectedChange={setSelected}
                onSetProduct={(target, product) => void bulk.run({ kind: 'product', items: [target], productName: product })}
              />
            ))}
          </div>
        ) : null}
        {!segmentsQuery.isError && view === 'table' ? (
          <SegmentLibraryTable
            segments={loaded}
            presets={presets}
            loading={segmentsQuery.isPending}
            canWrite={canWrite}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            cardNotes={cardNotes}
          />
        ) : null}
        {segmentsQuery.hasNextPage ? (
          <div className={styles.loadMore}>
            <span className={styles.fieldHelp}>已加载 {loaded.length} 条，还有更多</span>
            <Button className={styles.touchButton} loading={segmentsQuery.isFetchingNextPage} onClick={() => void segmentsQuery.fetchNextPage()}>
              加载更多
            </Button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
