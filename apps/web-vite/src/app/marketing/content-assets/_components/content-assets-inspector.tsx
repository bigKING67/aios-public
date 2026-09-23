import { useEffect, useState } from 'react';
import { Button, Empty, Skeleton, Tabs } from 'antd';
import {
  ApartmentOutlined,
  DatabaseOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type {
  ContentAssetAdMaterial,
  ContentAssetAnalysisProfile,
  ContentAssetAnalysisSource,
  ContentAssetDetailResponse,
  ContentAssetPlatformVideo,
  ContentAssetProcessingJob,
} from '../_lib/content-assets-types';
import { resolveContentAssetDisplayTitle } from '../_lib/content-assets-display';
import inspectorStyles from './content-assets-inspector.module.css';
import { AiTab } from './content-assets-inspector-ai-tab';
import { BaseInfoTab } from './content-assets-inspector-base-tab';
import {
  ContentAssetDetailWorkbench,
  ContentAssetDetailWorkbenchSkeleton,
  type ContentAssetDetailWorkbenchAction,
} from './content-asset-detail-workbench';
import { EventsTab } from './content-assets-inspector-events-tab';
import { IdentityTab } from './content-assets-inspector-identity-tab';
import { AssetStatusTag, LifecycleStatusTag } from './content-assets-status-tags';
import { ContentAssetsVideoPlayer } from './content-assets-video-player';

export function ContentAssetInspector({
  detail,
  loading,
  canWrite,
  layout = 'aside',
  className,
  activeAction,
  onEditProfile,
  onAddPlatformVideo,
  onAddAdMaterial,
  onEditPlatformVideo,
  onEditAdMaterial,
  processingJobs = [],
  onRefreshProcessingJobs,
  analysisActionLoading,
  analysisSubmittingProfile,
  onCreateAnalysisJob,
  transcriptActionLoading,
  onCreateTranscriptJob,
}: {
  detail: ContentAssetDetailResponse | null;
  loading: boolean;
  canWrite: boolean;
  layout?: 'aside' | 'page';
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
}) {
  const [activeTabKey, setActiveTabKey] = useState('base');
  const asset = detail?.asset;
  const Panel = layout === 'page' ? 'section' : 'aside';
  const panelClassName = [
    inspectorStyles.inspectorPanel,
    layout === 'page' ? inspectorStyles.inspectorPanelPage : '',
    className || '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    setActiveTabKey('base');
  }, [asset?.assetId]);

  if (loading && !detail) {
    if (layout === 'page') {
      return <ContentAssetDetailWorkbenchSkeleton className={panelClassName} />;
    }
    return (
      <Panel className={panelClassName}>
        <Skeleton active paragraph={{ rows: 10 }} />
      </Panel>
    );
  }

  if (!asset) {
    return (
      <Panel className={`${panelClassName} ${inspectorStyles.inspectorEmpty}`}>
        <Empty description="选择一个素材查看详情" />
      </Panel>
    );
  }
  const displayTitle = resolveContentAssetDisplayTitle(asset);
  const platformVideos = detail.platformVideos || [];
  const adMaterials = detail.adMaterials || [];
  const platformVideoCount = platformVideos.length;
  const adMaterialCount = adMaterials.length;
  const onlyPlatformVideo = platformVideos.length === 1 ? platformVideos[0] : undefined;
  const onlyAdMaterial = adMaterials.length === 1 ? adMaterials[0] : undefined;
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
  const actionBar = (
    <div className={inspectorStyles.inspectorActionBar}>
      <Button icon={<EditOutlined />} disabled={!canWrite} onClick={onEditProfile}>
        编辑档案
      </Button>
      <Button
        icon={platformVideoCount > 0 ? undefined : <PlusOutlined />}
        disabled={!canWrite && platformVideoCount === 0}
        onClick={handlePlatformVideoShortcut}
      >
        {platformVideoShortcutLabel}
      </Button>
      <Button
        icon={adMaterialCount > 0 ? undefined : <PlusOutlined />}
        disabled={!canWrite && adMaterialCount === 0}
        onClick={handleAdMaterialShortcut}
      >
        {adMaterialShortcutLabel}
      </Button>
    </div>
  );
  const tabs = (
    <Tabs
      className={inspectorStyles.inspectorTabs}
      size="small"
      activeKey={activeTabKey}
      onChange={setActiveTabKey}
      items={[
        {
          key: 'base',
          label: '业务档案',
          children: <BaseInfoTab detail={detail} onOpenDataMapping={() => setActiveTabKey('identity')} />,
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
          key: 'ai',
          label: '脚本/AI分析',
          children: (
            <AiTab
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
          key: 'events',
          label: '操作日志',
          children: <EventsTab detail={detail} />,
        },
      ]}
    />
  );

  if (layout === 'page') {
    return (
      <ContentAssetDetailWorkbench
        className={panelClassName}
        detail={detail}
        canWrite={canWrite}
        activeAction={activeAction}
        onEditProfile={onEditProfile}
        onAddPlatformVideo={onAddPlatformVideo}
        onAddAdMaterial={onAddAdMaterial}
        onEditPlatformVideo={onEditPlatformVideo}
        onEditAdMaterial={onEditAdMaterial}
        processingJobs={processingJobs}
        onRefreshProcessingJobs={onRefreshProcessingJobs}
        analysisActionLoading={analysisActionLoading}
        analysisSubmittingProfile={analysisSubmittingProfile ?? null}
        onCreateAnalysisJob={onCreateAnalysisJob}
        transcriptActionLoading={transcriptActionLoading}
        onCreateTranscriptJob={onCreateTranscriptJob}
      />
    );
  }

  return (
    <Panel className={panelClassName}>
      <div className={inspectorStyles.inspectorHeader}>
        <div>
          <p>素材详情</p>
          <h2>{displayTitle}</h2>
          <div className={inspectorStyles.inspectorStatusRow}>
            <AssetStatusTag value={asset.assetStatus} />
            <LifecycleStatusTag value={asset.lifecycleStatus} />
          </div>
        </div>
      </div>
      {actionBar}
      <div className={inspectorStyles.playerCard}>
        <ContentAssetsVideoPlayer asset={asset} />
      </div>
      <div className={inspectorStyles.identityHealth}>
        <div>
          <DatabaseOutlined />
          <span>{asset.externalOnly ? '待补源文件' : 'TOS 已入库'}</span>
        </div>
        <div>
          <ApartmentOutlined />
          <span>
            {platformVideoCount} 视频身份 / {adMaterialCount} 素材实例
          </span>
        </div>
      </div>
      {tabs}
    </Panel>
  );
}
