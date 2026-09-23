import { useEffect, useState } from 'react';
import { Button, Tabs } from 'antd';
import type {
  ContentAssetAdMaterial,
  ContentAssetAnalysisProfile,
  ContentAssetAnalysisSource,
  ContentAssetDetailResponse,
  ContentAssetPlatformVideo,
  ContentAssetProcessingJob,
} from '../_lib/content-assets-types';
import { resolveContentAssetProductText } from '../_lib/content-assets-display';
import { contentAssetPlatformNamesLabel } from '../_lib/content-assets-platforms';
import { formatSrtTextForDisplay } from '../_lib/content-assets-formatters';
import {
  contentAssetVideoTypeLabel,
  formatContentAssetScenePath,
  scenePathFromContentAsset,
} from '../_lib/content-assets-ui-helpers';
import {
  resolveCreatorAccountIdSummary,
  resolveCreatorNameSummary,
  resolveDouyinVideoIdSummary,
  resolveQianchuanMaterialIdSummary,
} from '../_lib/content-assets-identity-summary';
import { AiTab } from './content-assets-inspector-ai-tab';
import { DetailSummaryMetricCell } from './content-asset-detail-summary-metric-cell';
import {
  ContentAssetDetailWorkbenchActions,
  type ContentAssetDetailWorkbenchAction,
} from './content-asset-detail-workbench-actions';
import { BaseInfoTab } from './content-assets-inspector-base-tab';
import { EventsTab } from './content-assets-inspector-events-tab';
import { IdentityTab } from './content-assets-inspector-identity-tab';
import { ContentAssetsVideoPlayer } from './content-assets-video-player';
import { ProcessingJobProgress } from './content-asset-detail-processing-jobs';
import {
  ContentAssetWorkflowPanel,
  type ContentAssetDetailWorkflowItem,
} from './content-asset-detail-workflow';
import {
  findLatestProcessingJob,
  resolveMediaState,
  resolvePrimaryAction,
  resolveWorkflowJobState,
  resolveWorkflowJobValue,
} from './content-asset-detail-workbench-state';
import inspectorStyles from './content-assets-inspector.module.css';
import sharedStyles from '../content-assets.module.css';
import pageStyles from './content-assets-inspector-page.module.css';
import workbenchStyles from './content-assets-detail-workbench.module.css';

export { ContentAssetDetailWorkbenchSkeleton } from './content-asset-detail-workbench-skeleton';
export type { ContentAssetDetailWorkbenchAction } from './content-asset-detail-workbench-actions';

export interface ContentAssetDetailWorkbenchProps {
  detail: ContentAssetDetailResponse | null;
  canWrite: boolean;
  className?: string;
  activeAction?: ContentAssetDetailWorkbenchAction | null;
  onEditProfile: () => void;
  onAddPlatformVideo: () => void;
  onAddAdMaterial: () => void;
  onEditPlatformVideo: (item: ContentAssetPlatformVideo) => void;
  onEditAdMaterial: (item: ContentAssetAdMaterial) => void;
  processingJobs?: ContentAssetProcessingJob[];
  onRefreshProcessingJobs?: () => void;
  analysisActionLoading: boolean;
  analysisSubmittingProfile?: ContentAssetAnalysisProfile | null;
  onCreateAnalysisJob: (
    source: ContentAssetAnalysisSource,
    force: boolean,
    profile?: ContentAssetAnalysisProfile
  ) => void;
  transcriptActionLoading: boolean;
  onCreateTranscriptJob: (force: boolean) => void;
}

export function ContentAssetDetailWorkbench({
  detail,
  canWrite,
  className,
  activeAction,
  onEditProfile,
  onAddPlatformVideo,
  onAddAdMaterial,
  onEditPlatformVideo,
  onEditAdMaterial,
  processingJobs = [],
  analysisActionLoading,
  analysisSubmittingProfile,
  onCreateAnalysisJob,
  transcriptActionLoading,
  onCreateTranscriptJob,
}: ContentAssetDetailWorkbenchProps) {
  const asset = detail?.asset;
  const hasAnalysisObject = Boolean(detail?.objects?.some((object) => object.objectRole === 'analysis' && object.status === 'active'));
  const hasAiSummary = Boolean(asset?.aiSummary || asset?.aiAnalyzedAt);
  const defaultActiveTabKey = hasAiSummary || hasAnalysisObject ? 'ai' : 'script';
  const [activeTabKey, setActiveTabKey] = useState(defaultActiveTabKey);

  useEffect(() => {
    setActiveTabKey(defaultActiveTabKey);
  }, [asset?.assetId, defaultActiveTabKey]);

  if (!asset) return null;

  const platformVideos = detail.platformVideos || [];
  const adMaterials = detail.adMaterials || [];
  const platformVideoCount = platformVideos.length;
  const adMaterialCount = adMaterials.length;
  const onlyPlatformVideo = platformVideos.length === 1 ? platformVideos[0] : undefined;
  const onlyAdMaterial = adMaterials.length === 1 ? adMaterials[0] : undefined;
  const platformLabel = contentAssetPlatformNamesLabel(asset.platformNames, asset.platform);
  const productLabel = resolveContentAssetProductText(asset);
  const sceneInfo = resolveEffectiveScenePath(asset, detail.shortVideoProfileHint);
  const effectiveVideoType = asset.videoType || detail.shortVideoProfileHint?.videoType || null;
  const sceneLabel = formatContentAssetScenePath(sceneInfo.path);
  const showShortVideoProfileHintNote = (!asset.videoType && Boolean(detail.shortVideoProfileHint?.videoType))
    || (!asset.creatorName && Boolean(detail.shortVideoProfileHint?.creatorName))
    || sceneInfo.usesHint;
  const isShortVideoProfileHintAmbiguous = detail.shortVideoProfileHint?.matchStatus === 'ambiguous';
  const creatorNameLabel = resolveCreatorNameSummary(detail);
  const creatorAccountIdLabel = resolveCreatorAccountIdSummary(detail);
  const douyinVideoIdLabel = resolveDouyinVideoIdSummary(detail);
  const qianchuanMaterialIdLabel = resolveQianchuanMaterialIdSummary(detail);
  const mappingLabel = `${platformVideoCount} / ${adMaterialCount}`;
  const handlePlatformVideoShortcut = () => {
    if (onlyPlatformVideo && canWrite) {
      onEditPlatformVideo(onlyPlatformVideo);
      return;
    }
    if (platformVideos.length > 0) {
      setActiveTabKey('identity');
      return;
    }
    onAddPlatformVideo();
  };
  const handleAdMaterialShortcut = () => {
    if (onlyAdMaterial && canWrite) {
      onEditAdMaterial(onlyAdMaterial);
      return;
    }
    if (adMaterials.length > 0) {
      setActiveTabKey('identity');
      return;
    }
    onAddAdMaterial();
  };
  const handleOpenDataMapping = (anchor?: string) => {
    setActiveTabKey('identity');
    if (!anchor) return;
    window.setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
    }, 80);
  };
  const platformVideoShortcutLabel =
    platformVideoCount === 0 ? '补视频 ID' : platformVideoCount === 1 && canWrite ? '编辑视频 ID' : '查看视频 ID';
  const adMaterialShortcutLabel =
    adMaterialCount === 0 ? '补素材 ID' : adMaterialCount === 1 && canWrite ? '编辑素材 ID' : '查看素材 ID';
  const scriptPreviewText = detail.transcript?.srtText
    ? formatSrtTextForDisplay(detail.transcript.srtText)
    : detail.transcript?.scriptText || '';
  const scriptPreviewKind = detail.transcript?.srtText ? 'SRT 字幕' : detail.transcript?.scriptText ? '纯脚本' : 'SRT 预览';
  const latestTranscriptJob = findLatestProcessingJob(processingJobs, 'transcript');
  const latestAnalysisJob = findLatestProcessingJob(processingJobs, 'analysis');
  const hasTranscript = Boolean(detail.transcript?.scriptText || detail.transcript?.srtText);
  const hasTranscriptRecord = Boolean(asset.transcribedAt || detail.transcript?.createdAt);
  const authorizationReady = Boolean(asset.authorizationStatus && asset.authorizationStatus !== 'unknown');
  const profileReady = Boolean(
    (asset.profileStatus && asset.profileStatus !== 'incomplete') ||
    productLabel ||
    asset.creatorName ||
    authorizationReady ||
    asset.tags.length > 0
  );
  const mediaState = resolveMediaState(asset);
  const primaryAction = resolvePrimaryAction({
    canWrite,
    hasAiSummary,
    hasAnalysisObject,
    hasTranscript,
    hasPreview: Boolean(asset.previewObjectKey),
    hasRaw: Boolean(asset.rawObjectKey),
    durationSeconds: asset.durationSeconds,
    externalOnly: asset.externalOnly,
    transcriptJob: latestTranscriptJob,
    analysisJob: latestAnalysisJob,
    onCreateAnalysisJob,
    onCreateTranscriptJob,
  });
  const primaryProgressJob = primaryAction
    ? primaryAction.kind === 'analysis'
      ? latestAnalysisJob
      : latestTranscriptJob
    : null;
  const showPrimaryJobProgress =
    primaryProgressJob?.status === 'queued' ||
    primaryProgressJob?.status === 'running' ||
    primaryProgressJob?.status === 'succeeded';
  const workflowItems: ContentAssetDetailWorkflowItem[] = [
    {
      label: '源视频',
      value: mediaState.label,
      state: mediaState.state,
    },
    {
      label: '业务档案',
      value: profileReady ? '已补充' : '待补档案',
      state: profileReady ? 'ready' : 'blocked',
    },
    {
      label: '脚本转写',
      value: resolveWorkflowJobValue({
        fallback: hasTranscript ? '可复用' : hasTranscriptRecord ? '待读取正文' : '待生成',
        job: latestTranscriptJob,
        ready: hasTranscript,
      }),
      state: resolveWorkflowJobState({
        hasPartialRecord: hasTranscriptRecord,
        job: latestTranscriptJob,
        ready: hasTranscript,
      }),
    },
    {
      label: 'AI 分析',
      value: resolveWorkflowJobValue({
        fallback: hasAnalysisObject ? '完整结果' : hasAiSummary ? '摘要已生成' : '待分析',
        job: latestAnalysisJob,
        ready: hasAnalysisObject,
      }),
      state: resolveWorkflowJobState({
        hasPartialRecord: hasAiSummary,
        job: latestAnalysisJob,
        ready: hasAnalysisObject,
      }),
    },
    {
      label: '数据映射',
      value: mappingLabel,
      state: platformVideoCount + adMaterialCount > 0 ? 'ready' : 'blocked',
    },
  ];
  const tabs = (
    <Tabs
      className={`${inspectorStyles.inspectorTabs} ${pageStyles.detailTabs} ${workbenchStyles.detailTabs}`}
      size="small"
      activeKey={activeTabKey}
      onChange={setActiveTabKey}
      items={[
        {
          key: 'ai',
          label: 'AI 分析',
          children: (
            <AiTab
              mode="analysis"
              detail={detail}
              canWrite={canWrite}
              actionLoading={analysisActionLoading}
              submittingProfile={analysisSubmittingProfile ?? null}
              processingJobs={processingJobs}
              onCreateAnalysisJob={onCreateAnalysisJob}
              transcriptActionLoading={transcriptActionLoading}
              onCreateTranscriptJob={onCreateTranscriptJob}
              onOpenDataMapping={handleOpenDataMapping}
            />
          ),
        },
        {
          key: 'script',
          label: '脚本 / SRT',
          children: (
            <AiTab
              mode="script"
              detail={detail}
              canWrite={canWrite}
              actionLoading={analysisActionLoading}
              submittingProfile={analysisSubmittingProfile ?? null}
              processingJobs={processingJobs}
              onCreateAnalysisJob={onCreateAnalysisJob}
              transcriptActionLoading={transcriptActionLoading}
              onCreateTranscriptJob={onCreateTranscriptJob}
            />
          ),
        },
        {
          key: 'identity',
          label: '数据映射',
          children: (
            <IdentityTab
              detail={detail}
              canWrite={canWrite}
              onAddPlatformVideo={onAddPlatformVideo}
              onAddAdMaterial={onAddAdMaterial}
              onEditPlatformVideo={onEditPlatformVideo}
              onEditAdMaterial={onEditAdMaterial}
            />
          ),
        },
        {
          key: 'base',
          label: '业务档案',
          children: <BaseInfoTab detail={detail} onOpenDataMapping={() => setActiveTabKey('identity')} />,
        },
        {
          key: 'events',
          label: '操作日志',
          children: <EventsTab detail={detail} />,
        },
      ]}
    />
  );

  return (
    <section className={className}>
      <div className={pageStyles.workbenchStack}>
        <section className={pageStyles.overviewGrid} aria-label="素材概览">
          <section className={pageStyles.mediaColumn} aria-label="素材媒体预览">
            <div className={`${inspectorStyles.playerCard} ${pageStyles.playerFrame} ${pageStyles.playerFrameHero}`}>
              <ContentAssetsVideoPlayer asset={asset} variant="hero" />
            </div>
          </section>

          <aside className={workbenchStyles.detailColumn} aria-label="素材业务摘要">
            <section className={workbenchStyles.signalPanel} aria-label="素材关键结论">
              <div className={workbenchStyles.summaryBlock}>
                <div className={workbenchStyles.summaryHeader}>
                  <span>{hasAiSummary ? 'AI 摘要' : '下一步'}</span>
                  <strong className={workbenchStyles.scoreInline}>
                    <span>AI 评分</span>
                    {asset.aiScore == null ? '--' : asset.aiScore}
                  </strong>
                </div>
                <p>{asset.aiSummary || primaryAction?.helper || '补齐档案、脚本和 AI 分析后，可用于复剪判断与数据映射。'}</p>
              </div>
              <div className={workbenchStyles.healthGrid}>
                <DetailSummaryMetricCell label="产品：" value={productLabel || '--'} />
                <DetailSummaryMetricCell label="平台：" value={platformLabel || '--'} />
                <DetailSummaryMetricCell label="达人：" value={creatorNameLabel} />
                <DetailSummaryMetricCell label="达人账号：" value={creatorAccountIdLabel} />
                <DetailSummaryMetricCell label="抖音视频ID：" value={douyinVideoIdLabel} />
                <DetailSummaryMetricCell label="千川素材ID：" value={qianchuanMaterialIdLabel} />
                <DetailSummaryMetricCell label="视频类型：" value={contentAssetVideoTypeLabel(effectiveVideoType)} />
                <DetailSummaryMetricCell label="内容场景：" value={sceneLabel} />
              </div>
              {showShortVideoProfileHintNote ? (
                <p className={isShortVideoProfileHintAmbiguous ? sharedStyles.detailInlineWarning : sharedStyles.detailInlineNote}>
                  {isShortVideoProfileHintAmbiguous
                    ? '摘要里的视频类型/场景/达人来自挂车短视频明细中可唯一确认的回流字段；冲突字段需编辑档案后人工固化。'
                    : '摘要里的视频类型/场景/达人来自挂车短视频明细回流字段；保存档案后会固化到素材库。'}
                </p>
              ) : null}
            </section>

            <section className={workbenchStyles.heroPanel} aria-label="素材档案入口">
              <ContentAssetDetailWorkbenchActions
                activeAction={activeAction}
                canWrite={canWrite}
                platformVideoCount={platformVideoCount}
                adMaterialCount={adMaterialCount}
                platformVideoShortcutLabel={platformVideoShortcutLabel}
                adMaterialShortcutLabel={adMaterialShortcutLabel}
                onEditProfile={onEditProfile}
                onPlatformVideoShortcut={handlePlatformVideoShortcut}
                onAdMaterialShortcut={handleAdMaterialShortcut}
              />
            </section>

            <section className={workbenchStyles.scriptPreviewPanel} aria-label="视频脚本预览">
              <div className={workbenchStyles.scriptPreviewHeader}>
                <span>视频脚本</span>
                <strong>{scriptPreviewKind}</strong>
              </div>
              {scriptPreviewText ? (
                <pre>{scriptPreviewText}</pre>
              ) : (
                <p>
                  {showPrimaryJobProgress
                    ? '脚本生成后会在这里展示 SRT 时间轴；超出内容可在框内滚动查看。'
                    : '尚未生成脚本/SRT。生成后会在这里预览，完整内容仍保留在下方脚本页签。'}
                </p>
              )}
            </section>

            <section className={workbenchStyles.nextActionPanel} aria-label="素材下一步动作">
              <span>下一步</span>
              <strong>{primaryAction?.label || '继续完善素材映射'}</strong>
              {!showPrimaryJobProgress ? (
                <p>{primaryAction?.helper || '当前基础分析已就绪，可继续维护投放身份或业务档案。'}</p>
              ) : null}
              {showPrimaryJobProgress && primaryProgressJob ? (
                <ProcessingJobProgress job={primaryProgressJob} />
              ) : primaryAction ? (
                <Button
                  type="primary"
                  loading={primaryAction.kind === 'analysis' ? analysisActionLoading : transcriptActionLoading}
                  disabled={!primaryAction.enabled}
                  onClick={primaryAction.onClick}
                >
                  {primaryAction.buttonLabel || primaryAction.label}
                </Button>
              ) : (
                <Button disabled={!canWrite} onClick={onEditProfile}>
                  编辑档案
                </Button>
              )}
            </section>
          </aside>
        </section>

        <ContentAssetWorkflowPanel items={workflowItems} />

        {tabs}
      </div>
    </section>
  );
}

function shortVideoHintSceneSegments(
  hint: ContentAssetDetailResponse['shortVideoProfileHint']
): Array<string | undefined> {
  if (!hint) return [];
  return [hint.contentScene, hint.contentSceneGroup, hint.contentSceneSubtype]
    .map((value) => value?.trim())
    .map((value) => value || undefined);
}

function resolveEffectiveScenePath(
  asset: ContentAssetDetailResponse['asset'],
  hint: ContentAssetDetailResponse['shortVideoProfileHint']
): { path?: string[]; usesHint: boolean } {
  const assetScenePath = scenePathFromContentAsset(asset);
  const hintSegments = shortVideoHintSceneSegments(hint);
  const mergedPath = [0, 1, 2]
    .map((index) => assetScenePath?.[index] || hintSegments[index])
    .filter((value): value is string => Boolean(value));
  const usesHint = [0, 1, 2].some((index) => !assetScenePath?.[index] && Boolean(hintSegments[index]));

  return {
    path: mergedPath.length ? mergedPath : undefined,
    usesHint,
  };
}
