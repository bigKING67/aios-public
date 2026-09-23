import { Pagination, Segmented, Select } from 'antd';
import { CONTENT_ASSET_SORT_OPTIONS } from '../_lib/content-assets-filter-constants';
import { formatCompactNumber } from '../_lib/content-assets-formatters';
import type {
  ContentAssetFilterOptions,
  ContentAssetItem,
  ContentAssetProcessingJob,
  ContentAssetSort,
  ContentAssetSummary,
  ContentAssetTodoFilter,
  ContentAssetView,
} from '../_lib/content-assets-types';
import styles from '../content-assets.module.css';
import consoleStyles from './content-assets-console.module.css';
import controlsStyles from './content-assets-controls.module.css';
import { ContentAssetsGrid, ContentAssetsSkeleton, ContentAssetsTable } from './content-assets-asset-list';
import { ContentAssetsEmptyResult, ContentAssetsListUnavailable } from './content-assets-empty-states';
import { ContentAssetsFilterBar } from './content-assets-filter-bar';
import { ContentAssetsLibraryHeader } from './content-assets-library-header';

export function ContentAssetsLibraryPanel({
  assetStatus,
  canWrite,
  creatorName,
  contentScene,
  contentSceneGroup,
  contentSceneSubtype,
  error,
  externalOnly,
  filterOptions,
  isCompactPagination,
  isEmptyResult,
  isFetching,
  isInitialLoading,
  isListUnavailable,
  items,
  lifecycleStatus,
  processingJobs,
  todo,
  page,
  pageSize,
  platform,
  productName,
  ownerUserId,
  sort,
  summary,
  tags,
  totalAssets,
  videoType,
  view,
  onAssetStatusChange,
  onCreatorNameChange,
  onContentSceneChange,
  onContentSceneGroupChange,
  onContentSceneSubtypeChange,
  onExternalOnlyChange,
  onLifecycleStatusChange,
  onTodoChange,
  onOpenAsset,
  onSourceUploadOpen,
  onPageChange,
  onProductNameChange,
  onOwnerUserIdChange,
  onRefresh,
  onReset,
  onSearch,
  onSortChange,
  onPlatformChange,
  onTagsChange,
  onUploadOpen,
  onVideoTypeChange,
  onViewChange,
}: {
  assetStatus?: string;
  canWrite: boolean;
  creatorName?: string;
  contentScene?: string;
  contentSceneGroup?: string;
  contentSceneSubtype?: string;
  error: unknown;
  externalOnly: 'all' | 'true' | 'false';
  filterOptions: ContentAssetFilterOptions;
  isCompactPagination: boolean;
  isEmptyResult: boolean;
  isFetching: boolean;
  isInitialLoading: boolean;
  isListUnavailable: boolean;
  items: ContentAssetItem[];
  lifecycleStatus?: string;
  processingJobs: ContentAssetProcessingJob[];
  todo?: ContentAssetTodoFilter;
  page: number;
  pageSize: number;
  platform?: string;
  productName?: string;
  ownerUserId?: string;
  sort: ContentAssetSort;
  summary: ContentAssetSummary;
  tags: string[];
  totalAssets: number;
  videoType?: string;
  view: ContentAssetView;
  onAssetStatusChange: (value?: string) => void;
  onCreatorNameChange: (value?: string) => void;
  onContentSceneChange: (value?: string) => void;
  onContentSceneGroupChange: (value?: string) => void;
  onContentSceneSubtypeChange: (value?: string) => void;
  onExternalOnlyChange: (value: 'all' | 'true' | 'false') => void;
  onLifecycleStatusChange: (value?: string) => void;
  onTodoChange: (value?: ContentAssetTodoFilter) => void;
  onOpenAsset: (asset: ContentAssetItem) => void;
  onSourceUploadOpen: (asset: ContentAssetItem) => void;
  onPageChange: (page: number, pageSize: number) => void;
  onProductNameChange: (value?: string) => void;
  onOwnerUserIdChange: (value?: string) => void;
  onRefresh: () => void;
  onReset: () => void;
  onSearch: () => void;
  onSortChange: (value: ContentAssetSort) => void;
  onPlatformChange: (value?: string) => void;
  onTagsChange: (value: string[]) => void;
  onUploadOpen: () => void;
  onVideoTypeChange: (value?: string) => void;
  onViewChange: (view: ContentAssetView) => void;
}) {
  return (
    <div className={`${consoleStyles.contentGrid} ${consoleStyles.contentGridFull}`}>
      <section className={consoleStyles.libraryColumn}>
        <ContentAssetsLibraryHeader summary={summary} isFetching={isFetching} onRefresh={onRefresh} />
        <ContentAssetsFilterBar
          filterOptions={filterOptions}
          platform={platform}
          productName={productName}
          creatorName={creatorName}
          ownerUserId={ownerUserId}
          contentScene={contentScene}
          contentSceneGroup={contentSceneGroup}
          contentSceneSubtype={contentSceneSubtype}
          tags={tags}
          videoType={videoType}
          assetStatus={assetStatus}
          lifecycleStatus={lifecycleStatus}
          todo={todo}
          externalOnly={externalOnly}
          isFetching={isFetching}
          onPlatformChange={onPlatformChange}
          onProductNameChange={onProductNameChange}
          onCreatorNameChange={onCreatorNameChange}
          onOwnerUserIdChange={onOwnerUserIdChange}
          onContentSceneChange={onContentSceneChange}
          onContentSceneGroupChange={onContentSceneGroupChange}
          onContentSceneSubtypeChange={onContentSceneSubtypeChange}
          onTagsChange={onTagsChange}
          onVideoTypeChange={onVideoTypeChange}
          onAssetStatusChange={onAssetStatusChange}
          onLifecycleStatusChange={onLifecycleStatusChange}
          onTodoChange={onTodoChange}
          onExternalOnlyChange={onExternalOnlyChange}
          onReset={onReset}
          onSearch={onSearch}
          onRefresh={onRefresh}
        />

        <section className={styles.assetSurface}>
          <div className={styles.surfaceHeader}>
            <div>
              <h2>全部素材</h2>
              <p>
                共 {isListUnavailable ? '--' : formatCompactNumber(totalAssets)} 条资产，
                推荐排序优先展示已就绪素材，待补源与待生成素材沉到后面。
              </p>
            </div>
            <div className={controlsStyles.surfaceTools}>
              <Select<ContentAssetSort>
                className={controlsStyles.surfaceSort}
                size="small"
                value={sort}
                options={CONTENT_ASSET_SORT_OPTIONS}
                onChange={onSortChange}
              />
              <Segmented<ContentAssetView>
                value={view}
                options={[
                  { label: '卡片', value: 'grid' },
                  { label: '表格', value: 'table' },
                ]}
                onChange={onViewChange}
              />
            </div>
          </div>

          {isInitialLoading ? <ContentAssetsSkeleton /> : null}
          {isListUnavailable ? <ContentAssetsListUnavailable error={error} onRetry={onRefresh} /> : null}
          {isEmptyResult ? <ContentAssetsEmptyResult canWrite={canWrite} onUploadOpen={onUploadOpen} /> : null}
          {items.length > 0 && view === 'grid' ? (
            <ContentAssetsGrid
              items={items}
              processingJobs={processingJobs}
              onOpen={onOpenAsset}
              onSourceUploadOpen={onSourceUploadOpen}
            />
          ) : null}
          {!isListUnavailable && items.length > 0 && view === 'table' ? (
            <ContentAssetsTable
              items={items}
              processingJobs={processingJobs}
              onOpen={onOpenAsset}
              onSourceUploadOpen={onSourceUploadOpen}
            />
          ) : null}
          {!isListUnavailable && totalAssets > 0 ? (
            <div className={styles.paginationWrap}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={totalAssets}
                simple={isCompactPagination}
                size={isCompactPagination ? 'small' : undefined}
                showSizeChanger={!isCompactPagination}
                pageSizeOptions={['10', '20', '50', '100']}
                showTotal={isCompactPagination ? undefined : (total) => `共 ${total} 条`}
                onChange={onPageChange}
              />
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
