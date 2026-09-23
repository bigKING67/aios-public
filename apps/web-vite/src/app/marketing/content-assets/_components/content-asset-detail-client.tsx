'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Empty } from 'antd';
import {
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { usePermission } from '@/hooks/use-permission';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { CONTENT_ASSET_WRITE_PERMISSIONS } from '@/lib/report-permissions';
import {
  fetchContentAssetDetail,
  fetchContentAssetFilterOptions,
  fetchContentAssetProcessingJobs,
} from '../_lib/content-assets-api';
import { resolveContentAssetDetailTitleView } from '../_lib/content-assets-display';
import { contentAssetsQueryKeys } from '../_lib/content-assets-query-keys';
import type {
  ContentAssetAdMaterial,
  ContentAssetAnalysisProfile,
  ContentAssetAnalysisSource,
  ContentAssetPlatformVideo,
  ContentAssetProcessingJob,
} from '../_lib/content-assets-types';
import {
  createEmptyContentAssetFilterOptions,
  resolveContentAssetRequestError,
} from '../_lib/content-assets-ui-helpers';
import {
  isActiveProcessingJobStatus,
  isTerminalProcessingJobStatus,
  mergeProcessingJobs,
  processingJobTimestamp,
} from '../_lib/content-assets-processing-jobs';
import styles from '../content-assets.module.css';
import consoleStyles from './content-assets-console.module.css';
import {
  ContentAssetIdentityModal,
  type ContentAssetIdentityModalMode,
} from './content-assets-identity-modal';
import { ContentAssetInspector } from './content-assets-inspector';
import { ContentAssetProfileModal } from './content-assets-profile-modal';
import { useContentAssetsActionMutations } from './use-content-assets-action-mutations';

export function ContentAssetDetailClient({ assetId }: { assetId: string }) {
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [identityModalMode, setIdentityModalMode] = useState<ContentAssetIdentityModalMode | null>(null);
  const [editingPlatformVideo, setEditingPlatformVideo] = useState<ContentAssetPlatformVideo | null>(null);
  const [editingAdMaterial, setEditingAdMaterial] = useState<ContentAssetAdMaterial | null>(null);
  const [recentProcessingJobs, setRecentProcessingJobs] = useState<ContentAssetProcessingJob[]>([]);
  const globalCanWrite = usePermission(CONTENT_ASSET_WRITE_PERMISSIONS, 'any');
  const normalizedAssetId = assetId.trim();
  const detailProcessingJobsQuery = { assetId: normalizedAssetId, limit: 12 };

  const {
    data: detailData,
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: contentAssetsQueryKeys.detail(normalizedAssetId),
    queryFn: ({ signal }) => fetchContentAssetDetail(normalizedAssetId, { signal }),
    enabled: normalizedAssetId.length > 0,
  });

  const { data: filterOptionsData } = useQuery({
    queryKey: contentAssetsQueryKeys.filterOptions(),
    queryFn: fetchContentAssetFilterOptions,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: processingJobsData,
    refetch: refetchProcessingJobs,
  } = useQuery({
    queryKey: contentAssetsQueryKeys.processingJobs(detailProcessingJobsQuery),
    queryFn: ({ signal }) => fetchContentAssetProcessingJobs(detailProcessingJobsQuery, { signal }),
    enabled: normalizedAssetId.length > 0,
  });

  const closeIdentityModal = () => {
    setIdentityModalMode(null);
    setEditingPlatformVideo(null);
    setEditingAdMaterial(null);
  };

  const {
    updateProfileMutation,
    createPlatformVideoMutation,
    createAdMaterialMutation,
    updatePlatformVideoMutation,
    updateAdMaterialMutation,
    createAnalysisJobMutation,
    createTranscriptJobMutation,
  } = useContentAssetsActionMutations({
    onUploadSuccess: () => undefined,
    onProfileSuccess: () => setProfileModalOpen(false),
    onIdentitySuccess: closeIdentityModal,
    onProcessingJobSuccess: (job) => {
      setRecentProcessingJobs((jobs) => mergeProcessingJobs([], [job, ...jobs]).slice(0, 12));
      void refetchProcessingJobs();
      void refetch();
    },
  });

  const selectedDetail = detailData || null;
  const selectedAsset = selectedDetail?.asset || null;
  const activeDetailAction = profileModalOpen
    ? 'profile'
    : identityModalMode === 'platform-video'
      ? 'platform-video'
      : identityModalMode === 'ad-material'
        ? 'ad-material'
        : null;
  const canEditSelectedAsset = selectedAsset?.canEdit ?? globalCanWrite;
  const detailTitleView = selectedAsset ? resolveContentAssetDetailTitleView(selectedAsset) : null;
  const filterOptions = filterOptionsData ?? createEmptyContentAssetFilterOptions();
  const isUnavailable = !!error && !detailData;
  const processingJobs = mergeProcessingJobs(processingJobsData?.items || [], recentProcessingJobs);
  const hasActiveProcessingJob = Boolean(
    processingJobs.some((job) => isActiveProcessingJobStatus(job.status))
  );
  let latestTerminalProcessingJob: ContentAssetProcessingJob | null = null;
  let latestTerminalProcessingJobTime = -1;
  for (const job of processingJobs) {
    if (!isTerminalProcessingJobStatus(job.status)) continue;
    const timestamp = processingJobTimestamp(job);
    if (timestamp > latestTerminalProcessingJobTime) {
      latestTerminalProcessingJob = job;
      latestTerminalProcessingJobTime = timestamp;
    }
  }
  const latestTerminalProcessingJobSignature = latestTerminalProcessingJob
    ? `${latestTerminalProcessingJob.jobId}:${latestTerminalProcessingJob.status}:${latestTerminalProcessingJob.updatedAt}:${latestTerminalProcessingJob.finishedAt}`
    : null;

  useEffect(() => {
    setRecentProcessingJobs([]);
  }, [normalizedAssetId]);

  useEffect(() => {
    if (!hasActiveProcessingJob) return undefined;
    const intervalId = window.setInterval(() => {
      void refetchProcessingJobs();
      void refetch();
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [hasActiveProcessingJob, refetch, refetchProcessingJobs]);

  useEffect(() => {
    if (!latestTerminalProcessingJobSignature) return;
    void refetch();
  }, [latestTerminalProcessingJobSignature, refetch]);

  const openPlatformVideoCreate = () => {
    setEditingPlatformVideo(null);
    setEditingAdMaterial(null);
    setIdentityModalMode('platform-video');
  };

  const openAdMaterialCreate = () => {
    setEditingPlatformVideo(null);
    setEditingAdMaterial(null);
    setIdentityModalMode('ad-material');
  };

  return (
    <ProtectedRoute>
      <Layout variant="immersive">
        <main className={styles.pageShell}>
          <section className={consoleStyles.detailConsole}>
            <header className={consoleStyles.detailTopbar}>
              <Link className={consoleStyles.detailBackLink} to={ROUTE_PATHS.marketingContentAssets}>
                <ArrowLeftOutlined />
                返回素材库
              </Link>
              <div className={consoleStyles.detailTopbarMeta}>
                <span>素材详情</span>
                <div className={consoleStyles.detailTopbarTitleRow}>
                  <strong>{detailTitleView?.primaryTitle || normalizedAssetId}</strong>
                  {detailTitleView ? (
                    <span className={consoleStyles.detailTitleBadge}>{detailTitleView.primaryTitleHint}</span>
                  ) : null}
                </div>
                {detailTitleView ? (
                  <div className={consoleStyles.detailTitleSourceLine}>
                    {detailTitleView.sourceTitle ? (
                      <span className={consoleStyles.detailOriginalTitle}>
                        原始素材名：{detailTitleView.sourceTitle}
                      </span>
                    ) : null}
                    {detailTitleView.sourceHint ? <span>{detailTitleView.sourceHint}</span> : null}
                    {detailTitleView.sourceContext ? <span>{detailTitleView.sourceContext}</span> : null}
                  </div>
                ) : null}
              </div>
              <Button loading={isFetching} onClick={() => refetch()}>
                刷新详情
              </Button>
            </header>

            <div className={consoleStyles.detailWorkspace}>
              {error ? (
                <Alert
                  className={consoleStyles.detailAlert}
                  type="error"
                  showIcon
                  message="素材详情加载失败"
                  description={resolveContentAssetRequestError(error)}
                />
              ) : null}

              {isUnavailable ? (
                <div className={styles.emptySurface}>
                  <Empty description={null} />
                  <strong>暂时无法打开该素材</strong>
                  <p className={styles.detailNote}>请返回素材库确认素材是否仍存在，或稍后重试详情加载。</p>
                  <Button type="primary" onClick={() => refetch()}>
                    重试详情
                  </Button>
                </div>
              ) : (
                <ContentAssetInspector
                  layout="page"
                  detail={selectedDetail}
                  loading={isLoading}
                  canWrite={canEditSelectedAsset}
                  activeAction={activeDetailAction}
                  onEditProfile={() => setProfileModalOpen(true)}
                  onAddPlatformVideo={openPlatformVideoCreate}
                  onAddAdMaterial={openAdMaterialCreate}
                  onEditPlatformVideo={(item) => {
                    setEditingPlatformVideo(item);
                    setEditingAdMaterial(null);
                    setIdentityModalMode('platform-video');
                  }}
                  onEditAdMaterial={(item) => {
                    setEditingAdMaterial(item);
                    setEditingPlatformVideo(null);
                    setIdentityModalMode('ad-material');
                  }}
                  processingJobs={processingJobs}
                  onRefreshProcessingJobs={() => {
                    void refetchProcessingJobs();
                    void refetch();
                  }}
                  analysisActionLoading={createAnalysisJobMutation.isPending}
                  analysisSubmittingProfile={
                    createAnalysisJobMutation.isPending
                      ? createAnalysisJobMutation.variables?.payload.profile ?? null
                      : null
                  }
                  onCreateAnalysisJob={(
                    source: ContentAssetAnalysisSource,
                    force: boolean,
                    profile?: ContentAssetAnalysisProfile
                  ) => {
                    if (!selectedAsset) return;
                    createAnalysisJobMutation.mutate({
                      assetId: selectedAsset.assetId,
                      payload: { source, profile, force },
                    });
                  }}
                  transcriptActionLoading={createTranscriptJobMutation.isPending}
                  onCreateTranscriptJob={(force: boolean) => {
                    if (!selectedAsset) return;
                    createTranscriptJobMutation.mutate({
                      assetId: selectedAsset.assetId,
                      payload: { source: 'auto', force },
                    });
                  }}
                />
              )}
            </div>

            <ContentAssetProfileModal
              open={profileModalOpen}
              detail={selectedDetail}
              saving={updateProfileMutation.isPending}
              filterOptions={filterOptions}
              onCancel={() => setProfileModalOpen(false)}
              onSubmit={(payload) => {
                if (!selectedAsset) return;
                updateProfileMutation.mutate({ assetId: selectedAsset.assetId, payload });
              }}
            />
            <ContentAssetIdentityModal
              open={identityModalMode !== null}
              mode={identityModalMode || 'platform-video'}
              detail={selectedDetail}
              platformVideo={editingPlatformVideo}
              adMaterial={editingAdMaterial}
              saving={
                createPlatformVideoMutation.isPending ||
                createAdMaterialMutation.isPending ||
                updatePlatformVideoMutation.isPending ||
                updateAdMaterialMutation.isPending
              }
              onCancel={closeIdentityModal}
              onSubmitPlatformVideo={(payload) => {
                if (!selectedAsset) return;
                if (editingPlatformVideo) {
                  updatePlatformVideoMutation.mutate({
                    assetId: selectedAsset.assetId,
                    platformVideoId: editingPlatformVideo.platformVideoId,
                    payload,
                  });
                  return;
                }
                createPlatformVideoMutation.mutate({ assetId: selectedAsset.assetId, payload });
              }}
              onSubmitAdMaterial={(payload) => {
                if (!selectedAsset) return;
                if (editingAdMaterial) {
                  updateAdMaterialMutation.mutate({
                    assetId: selectedAsset.assetId,
                    adMaterialId: editingAdMaterial.adMaterialId,
                    payload,
                  });
                  return;
                }
                createAdMaterialMutation.mutate({ assetId: selectedAsset.assetId, payload });
              }}
            />
          </section>
        </main>
      </Layout>
    </ProtectedRoute>
  );
}
