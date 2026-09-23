'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useMediaQuery } from '@/hooks/use-media-query';
import { usePermission } from '@/hooks/use-permission';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  CONTENT_ASSET_MANAGE_PERMISSIONS,
  CONTENT_ASSET_WRITE_PERMISSIONS,
} from '@/lib/report-permissions';
import { fetchContentAssetCoverage, fetchContentAssetFilterOptions, fetchContentAssetProcessingJobs, fetchContentAssets, fetchContentAssetUnmatchedStats } from '../_lib/content-assets-api';
import { contentAssetsQueryKeys } from '../_lib/content-assets-query-keys';
import type {
  ContentAssetItem,
  ContentAssetProcessingJob,
  ContentAssetUploadProgress,
} from '../_lib/content-assets-types';
import { resolveContentAssetDisplayTitle, resolveContentAssetProductText } from '../_lib/content-assets-display';
import { contentAssetPlatformLabel } from '../_lib/content-assets-platforms';
import { isActiveProcessingJobStatus } from '../_lib/content-assets-processing-jobs';
import {
  createContentAssetCoverageFromSummary,
  createEmptyContentAssetFilterOptions,
  createEmptyContentAssetSummary,
} from '../_lib/content-assets-ui-helpers';
import styles from '../content-assets.module.css';
import consoleStyles from './content-assets-console.module.css';
import { ContentAssetsUploadModal } from './content-assets-import-modal';
import {
  buildContentAssetUploadPrefillFromSearch,
  CONTENT_ASSET_UPLOAD_PREFILL_QUERY_KEYS,
  type ContentAssetUploadPrefill,
} from './content-assets-import-modal-values';
import { ContentAssetsLibraryPanel } from './content-assets-library-panel';
import { ContentAssetsModuleNav } from './content-assets-module-nav';
import { ContentAssetsTopbar } from './content-assets-topbar';
import { ContentAssetsWorkspacePanel } from './content-assets-workspace-panels';
import { useContentAssetsActionMutations } from './use-content-assets-action-mutations';
import { useContentAssetsClientState } from './use-content-assets-client-state';

export function ContentAssetsClient() {
  const location = useLocation();
  const navigate = useNavigate();
  const isCompactPagination = useMediaQuery('(max-width: 720px)');
  const {
    activeModule,
    keywordInput,
    platform,
    productName,
    creatorName,
    ownerUserId,
    videoType,
    contentScene,
    contentSceneGroup,
    contentSceneSubtype,
    tags,
    assetStatus,
    lifecycleStatus,
    todo,
    externalOnly,
    sort,
    view,
    page,
    pageSize,
    videoJobStatus,
    videoJobType,
    aiJobStatus,
    aiJobType,
    unmatchedStatsMatchType,
    unmatchedBindTargetAssetId,
    queryParams,
    videoProcessingJobsQuery,
    aiProcessingJobsQuery,
    assetProcessingJobsQuery,
    unmatchedStatsQuery,
    applySearch,
    resetFilters,
    updatePlatform,
    updateProductName,
    updateCreatorName,
    updateOwnerUserId,
    updateVideoType,
    updateContentScene,
    updateContentSceneGroup,
    updateContentSceneSubtype,
    updateTags,
    updateAssetStatus,
    updateLifecycleStatus,
    updateTodo,
    updateExternalOnly,
    openAssetsWithTodo,
    openAssetsWithPreset,
    setActiveModule,
    setKeywordInput,
    setSort,
    setView,
    setPage,
    setPageSize,
    setVideoJobStatus,
    setVideoJobType,
    setAiJobStatus,
    setAiJobType,
    setUnmatchedStatsMatchType,
    setUnmatchedBindTargetAssetId,
  } = useContentAssetsClientState();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadPrefill, setUploadPrefill] = useState<ContentAssetUploadPrefill | null>(null);
  const [sourceUploadAsset, setSourceUploadAsset] = useState<ContentAssetItem | null>(null);
  const [uploadProgress, setUploadProgress] = useState<ContentAssetUploadProgress | null>(null);

  const canWrite = usePermission(CONTENT_ASSET_WRITE_PERMISSIONS, 'any');
  const canManage = usePermission(CONTENT_ASSET_MANAGE_PERMISSIONS, 'any');

  const { data, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: contentAssetsQueryKeys.list(queryParams),
    queryFn: ({ signal }) => fetchContentAssets(queryParams, { signal }),
  });

  const { data: standaloneFilterOptions } = useQuery({
    queryKey: contentAssetsQueryKeys.filterOptions(),
    queryFn: fetchContentAssetFilterOptions,
    staleTime: 5 * 60 * 1000,
  });

  const { data: coverageData } = useQuery({
    queryKey: contentAssetsQueryKeys.coverage(),
    queryFn: fetchContentAssetCoverage,
    staleTime: 60 * 1000,
  });

  const {
    data: videoProcessingJobsData,
    isFetching: isVideoProcessingJobsFetching,
    refetch: refetchVideoProcessingJobs,
  } = useQuery({
    queryKey: contentAssetsQueryKeys.processingJobs(videoProcessingJobsQuery),
    queryFn: ({ signal }) => fetchContentAssetProcessingJobs(videoProcessingJobsQuery, { signal }),
    enabled: activeModule === 'video',
  });

  const {
    data: aiProcessingJobsData,
    isFetching: isAiProcessingJobsFetching,
    refetch: refetchAiProcessingJobs,
  } = useQuery({
    queryKey: contentAssetsQueryKeys.processingJobs(aiProcessingJobsQuery),
    queryFn: ({ signal }) => fetchContentAssetProcessingJobs(aiProcessingJobsQuery, { signal }),
    enabled: activeModule === 'ai',
  });

  const { data: assetProcessingJobsData } = useQuery({
    queryKey: contentAssetsQueryKeys.processingJobs(assetProcessingJobsQuery),
    queryFn: ({ signal }) => fetchContentAssetProcessingJobs(assetProcessingJobsQuery, { signal }),
    enabled: activeModule === 'assets',
    refetchInterval: (query) => (hasActiveProcessingJobs(query.state.data?.items || []) ? 5000 : false),
  });

  const {
    data: unmatchedStatsData,
    isFetching: isUnmatchedStatsFetching,
    refetch: refetchUnmatchedStats,
  } = useQuery({
    queryKey: contentAssetsQueryKeys.unmatchedStats(unmatchedStatsQuery),
    queryFn: ({ signal }) => fetchContentAssetUnmatchedStats(unmatchedStatsQuery, { signal }),
    enabled: activeModule === 'matching',
  });

  const {
    uploadMutation,
    videoLinkImportMutation,
    retryProcessingJobMutation,
    cancelProcessingJobMutation,
    resetStaleProcessingJobMutation,
    backfillDerivativeJobsMutation,
    backfillAiJobsMutation,
    bindUnmatchedStatsMutation,
  } = useContentAssetsActionMutations({
    onUploadSuccess: () => {
      setUploadModalOpen(false);
      setUploadPrefill(null);
      setSourceUploadAsset(null);
    },
    onProfileSuccess: () => undefined,
    onIdentitySuccess: () => undefined,
    onUploadProgress: setUploadProgress,
  });

  const summary = data?.summary ?? createEmptyContentAssetSummary();
  const coverage = coverageData ?? createContentAssetCoverageFromSummary(summary);
  const filterOptions = data?.filterOptions ?? standaloneFilterOptions ?? createEmptyContentAssetFilterOptions();
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const editableItems = useMemo(
    () => items.filter((item) => item.canEdit),
    [items]
  );
  const totalAssets = data?.total ?? 0;
  const isListUnavailable = !!error && !data;
  const isInitialLoading = isLoading && !data;
  const isEmptyResult = !isListUnavailable && !isInitialLoading && items.length === 0;

  useEffect(() => {
    if (!canWrite) {
      if (unmatchedBindTargetAssetId) setUnmatchedBindTargetAssetId(null);
      return;
    }
    if (
      unmatchedBindTargetAssetId &&
      editableItems.some((item) => item.assetId === unmatchedBindTargetAssetId)
    ) {
      return;
    }
    setUnmatchedBindTargetAssetId(editableItems[0]?.assetId ?? null);
  }, [canWrite, editableItems, unmatchedBindTargetAssetId, setUnmatchedBindTargetAssetId]);

  useEffect(() => {
    const nextUploadPrefill = buildContentAssetUploadPrefillFromSearch(location.search);
    if (!nextUploadPrefill) {
      return;
    }

    setUploadPrefill(nextUploadPrefill);
    setSourceUploadAsset(null);
    setUploadModalOpen(true);
    setActiveModule('assets');

    const params = new URLSearchParams(location.search);
    for (const key of CONTENT_ASSET_UPLOAD_PREFILL_QUERY_KEYS) {
      params.delete(key);
    }
    const nextSearch = params.toString();
    navigate(
      `${location.pathname}${nextSearch ? `?${nextSearch}` : ''}${location.hash}`,
      { replace: true }
    );
  }, [location.hash, location.pathname, location.search, navigate, setActiveModule]);

  const openAssetDetail = (asset: ContentAssetItem) => {
    navigate(`${ROUTE_PATHS.marketingContentAssets}/${encodeURIComponent(asset.assetId)}`);
  };

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setUploadPrefill(null);
    setSourceUploadAsset(null);
  };

  const openUploadModal = () => {
    setUploadPrefill(null);
    setUploadModalOpen(true);
  };

  const openSourceUploadModal = (asset: ContentAssetItem | null) => {
    setUploadPrefill(null);
    setSourceUploadAsset(asset);
  };

  return (
    <ProtectedRoute>
      <Layout variant="immersive">
        <main className={styles.pageShell}>
          <div className={consoleStyles.consoleShell}>
            <ContentAssetsModuleNav activeModule={activeModule} summary={summary} onModuleChange={setActiveModule} />
            <section className={consoleStyles.consoleMain}>
              <ContentAssetsTopbar
                activeModule={activeModule}
                keywordInput={keywordInput}
                canWrite={canWrite}
                onModuleChange={setActiveModule}
                onKeywordInputChange={setKeywordInput}
                onSearch={applySearch}
                onUploadOpen={openUploadModal}
              />
              {activeModule === 'assets' ? (
                <ContentAssetsLibraryPanel
                  assetStatus={assetStatus}
                  canWrite={canWrite}
                  creatorName={creatorName}
                  contentScene={contentScene}
                  contentSceneGroup={contentSceneGroup}
                  contentSceneSubtype={contentSceneSubtype}
                  error={error}
                  externalOnly={externalOnly}
                  filterOptions={filterOptions}
                  isCompactPagination={isCompactPagination}
                  isEmptyResult={isEmptyResult}
                  isFetching={isFetching}
                  isInitialLoading={isInitialLoading}
                  isListUnavailable={isListUnavailable}
                  items={items}
                  lifecycleStatus={lifecycleStatus}
                  processingJobs={assetProcessingJobsData?.items || []}
                  page={page}
                  pageSize={pageSize}
                  platform={platform}
                  productName={productName}
                  ownerUserId={ownerUserId}
                  sort={sort}
                  summary={summary}
                  tags={tags}
                  todo={todo}
                  totalAssets={totalAssets}
                  videoType={videoType}
                  view={view}
                  onAssetStatusChange={updateAssetStatus}
                  onCreatorNameChange={updateCreatorName}
                  onContentSceneChange={updateContentScene}
                  onContentSceneGroupChange={updateContentSceneGroup}
                  onContentSceneSubtypeChange={updateContentSceneSubtype}
                  onExternalOnlyChange={updateExternalOnly}
                  onLifecycleStatusChange={updateLifecycleStatus}
                  onOpenAsset={openAssetDetail}
                  onSourceUploadOpen={openSourceUploadModal}
                  onPageChange={(nextPage, nextPageSize) => {
                    setPage(nextPage);
                    if (nextPageSize !== pageSize) setPageSize(nextPageSize);
                  }}
                  onProductNameChange={updateProductName}
                  onOwnerUserIdChange={updateOwnerUserId}
                  onRefresh={() => refetch()}
                  onReset={resetFilters}
                  onSearch={applySearch}
                  onSortChange={(value) => {
                    setSort(value);
                    setPage(1);
                  }}
                  onPlatformChange={updatePlatform}
                  onTagsChange={updateTags}
                  onTodoChange={updateTodo}
                  onUploadOpen={openUploadModal}
                  onVideoTypeChange={updateVideoType}
                  onViewChange={setView}
                />
              ) : (
                <div className={consoleStyles.workspaceScroll}>
                  <ContentAssetsWorkspacePanel
                    activeModule={activeModule}
                    canManage={canManage}
                    canWrite={canWrite}
                    processingJobActionLoading={
                      retryProcessingJobMutation.isPending ||
                      cancelProcessingJobMutation.isPending ||
                      resetStaleProcessingJobMutation.isPending ||
                      backfillDerivativeJobsMutation.isPending ||
                      backfillAiJobsMutation.isPending
                    }
                    aiProcessingJobsData={aiProcessingJobsData || null}
                    aiProcessingJobsLoading={isAiProcessingJobsFetching}
                    aiProcessingJobStatus={aiJobStatus}
                    aiProcessingJobType={aiJobType}
                    processingJobsData={videoProcessingJobsData || null}
                    processingJobsLoading={isVideoProcessingJobsFetching}
                    processingJobStatus={videoJobStatus}
                    processingJobType={videoJobType}
                    coverage={coverage}
                    summary={summary}
                    onBackfillDerivativeJobs={() => backfillDerivativeJobsMutation.mutate({ limit: 100 })}
                    onBackfillAiJobs={(payload) => backfillAiJobsMutation.mutate(payload)}
                    onOpenAssets={() => setActiveModule('assets')}
                    onOpenAssetsWithPreset={openAssetsWithPreset}
                    onOpenAssetsWithTodo={openAssetsWithTodo}
                    onOpenModule={setActiveModule}
                    onAiProcessingJobStatusChange={setAiJobStatus}
                    onAiProcessingJobTypeChange={setAiJobType}
                    onProcessingJobStatusChange={setVideoJobStatus}
                    onProcessingJobTypeChange={setVideoJobType}
                    onRefreshAiProcessingJobs={() => refetchAiProcessingJobs()}
                    onRefreshProcessingJobs={() => refetchVideoProcessingJobs()}
                    onRetryProcessingJob={(jobId) => retryProcessingJobMutation.mutate(jobId)}
                    onCancelProcessingJob={(jobId) => cancelProcessingJobMutation.mutate(jobId)}
                    onResetStaleProcessingJob={(jobId) => resetStaleProcessingJobMutation.mutate(jobId)}
                    unmatchedStatsActionLoading={bindUnmatchedStatsMutation.isPending}
                    unmatchedStatsData={unmatchedStatsData || null}
                    unmatchedStatsLoading={isUnmatchedStatsFetching}
                    unmatchedStatsMatchType={unmatchedStatsMatchType}
                    unmatchedBindTargetAssetId={unmatchedBindTargetAssetId}
                    unmatchedAssetOptions={editableItems.map((item) => ({
                      label: resolveContentAssetDisplayTitle(item),
                      value: item.assetId,
                      helper: [contentAssetPlatformLabel(item.platform), resolveContentAssetProductText(item), item.creatorName]
                        .filter((value) => value && value !== '--')
                        .join(' · '),
                    }))}
                    onUnmatchedStatsMatchTypeChange={setUnmatchedStatsMatchType}
                    onUnmatchedBindTargetAssetChange={setUnmatchedBindTargetAssetId}
                    onRefreshUnmatchedStats={() => refetchUnmatchedStats()}
                    onBindUnmatchedStats={(item) => {
                      if (!unmatchedBindTargetAssetId) return;
                      bindUnmatchedStatsMutation.mutate({
                        matchType: item.matchType === 'platform_video' ? 'platform_video' : 'ad_material',
                        assetId: unmatchedBindTargetAssetId,
                        platform: item.platform,
                        accountId: item.accountId,
                        accountName: item.accountName,
                        advertiserId: item.advertiserId,
                        externalMaterialId: item.externalMaterialId,
                        externalVideoId: item.externalVideoId,
                        externalItemId: item.externalItemId,
                        externalNoteId: item.externalNoteId,
                      });
                    }}
                    onUploadOpen={openUploadModal}
                  />
                </div>
              )}
            </section>
          </div>

          <ContentAssetsUploadModal
            open={uploadModalOpen || Boolean(sourceUploadAsset)}
            confirmLoading={uploadMutation.isPending || videoLinkImportMutation.isPending}
            filterOptions={filterOptions}
            onCancel={closeUploadModal}
            progress={uploadProgress}
            sourceAsset={sourceUploadAsset}
            uploadPrefill={uploadPrefill}
            onSubmit={(payload) => uploadMutation.mutate(payload)}
            onSubmitVideoLink={(payload) => videoLinkImportMutation.mutateAsync(payload)}
          />
        </main>
      </Layout>
    </ProtectedRoute>
  );
}

function hasActiveProcessingJobs(items: ContentAssetProcessingJob[]): boolean {
  return items.some((job) => isActiveProcessingJobStatus(job.status));
}
