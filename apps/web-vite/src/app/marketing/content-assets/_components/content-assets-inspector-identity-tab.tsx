import { Button, Empty, Tag } from 'antd';
import { EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import type {
  ContentAssetAdMaterial,
  ContentAssetDetailResponse,
  ContentAssetPlatformVideo,
} from '../_lib/content-assets-types';
import { contentAssetPlatformLabel } from '../_lib/content-assets-platforms';
import styles from '../content-assets.module.css';
import inspectorStyles from './content-assets-inspector.module.css';
import { PerformanceSnapshotSection } from './content-assets-inspector-ai-sections';
import {
  type AdMaterialPlatformVideoResolution,
  buildPlatformVideoIndex,
  isMaterialLinkedToPlatformVideo,
  normalizedIdentityKey,
  platformVideoPrimaryId,
  resolveAdMaterialPlatformVideo,
} from './content-assets-inspector-identity-linking';

export function IdentityTab({
  detail,
  canWrite,
  onAddPlatformVideo,
  onAddAdMaterial,
  onEditPlatformVideo,
  onEditAdMaterial,
}: {
  detail: ContentAssetDetailResponse | null;
  canWrite: boolean;
  onAddPlatformVideo: () => void;
  onAddAdMaterial: () => void;
  onEditPlatformVideo: (item: ContentAssetPlatformVideo) => void;
  onEditAdMaterial: (item: ContentAssetAdMaterial) => void;
}) {
  const platformVideos = detail?.platformVideos || [];
  const adMaterials = detail?.adMaterials || [];
  const asset = detail?.asset;
  const performanceSnapshot = detail?.performanceSnapshot ?? null;
  const platformVideoIndex = buildPlatformVideoIndex(platformVideos);
  const linkedMaterialCount = adMaterials.filter((item) =>
    resolveAdMaterialPlatformVideo(item, platformVideoIndex).status === 'matched'
  ).length;
  const materialSnapshotCount = performanceSnapshot?.totals?.materialCount ?? performanceSnapshot?.materials?.length ?? 0;
  const hasPerformanceData = Boolean(performanceSnapshot?.hasQianchuanPerformance || materialSnapshotCount > 0);
  const hasPlatformMaterialId = platformVideos.some((item) => item.externalItemId?.trim());
  const adMaterialEmptyDescription = hasPlatformMaterialId
    ? '已填写千川素材ID，待同步投放素材实例'
    : '待补充千川素材ID';
  const adMaterialSummaryHelper = hasPlatformMaterialId && adMaterials.length === 0
    ? '已在平台身份中填写素材 ID'
    : `${linkedMaterialCount} 条已带视频关联`;
  const dataReadinessLabel =
    platformVideos.length + adMaterials.length === 0
      ? '待绑定'
      : hasPerformanceData
        ? '可复盘'
        : '待回流';
  const performanceHelper = hasPerformanceData
    ? `最新统计日 ${performanceSnapshot?.latestStatDate || '--'}`
    : '缺投放快照 / 待刷新';

  return (
    <div className={styles.detailStack}>
      <div id="data-mapping" className={inspectorStyles.identityGuide}>
        <strong>数据回流规则</strong>
        <p>这里集中维护 AI 分析依赖的数据输入：平台发布身份、千川素材实例、投放快照和日趋势证据。</p>
      </div>
      <div className={inspectorStyles.identitySummaryGrid}>
        <IdentitySummaryCard label="数据准备度" value={dataReadinessLabel} helper={performanceHelper} />
        <IdentitySummaryCard label="平台身份" value={platformVideos.length.toString()} helper="抖音视频 / 笔记 ID" />
        <IdentitySummaryCard label="投放实例" value={adMaterials.length.toString()} helper={adMaterialSummaryHelper} />
      </div>
      <section className={styles.detailSection}>
        <div className={inspectorStyles.sectionTitleRow}>
          <h3>平台发布身份</h3>
          <Button size="small" icon={<PlusOutlined />} disabled={!canWrite} onClick={onAddPlatformVideo}>
            {platformVideos.length > 0 ? '补充另一条' : '新增'}
          </Button>
        </div>
        {platformVideos.length === 0 ? (
          <div className={inspectorStyles.identityEmptyAction}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="待补充平台发布身份">
              <Button size="small" type="primary" icon={<PlusOutlined />} disabled={!canWrite} onClick={onAddPlatformVideo}>
                新增平台身份
              </Button>
            </Empty>
          </div>
        ) : (
          <div className={inspectorStyles.identityList}>
            {platformVideos.map((item) => (
              <PlatformVideoIdentityCard
                key={item.platformVideoId}
                item={item}
                linkedMaterials={adMaterials.filter((material) => isMaterialLinkedToPlatformVideo(material, item))}
                canWrite={canWrite}
                onEdit={onEditPlatformVideo}
              />
            ))}
          </div>
        )}
      </section>
      <section className={styles.detailSection}>
        <div className={inspectorStyles.sectionTitleRow}>
          <h3>投放素材实例</h3>
          <Button size="small" icon={<PlusOutlined />} disabled={!canWrite} onClick={onAddAdMaterial}>
            {adMaterials.length > 0 ? '补充另一条' : '新增'}
          </Button>
        </div>
        {adMaterials.length === 0 ? (
          <div className={inspectorStyles.identityEmptyAction}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={adMaterialEmptyDescription}>
              <Button size="small" type="primary" icon={<PlusOutlined />} disabled={!canWrite} onClick={onAddAdMaterial}>
                新增素材实例
              </Button>
            </Empty>
          </div>
        ) : (
          <div className={inspectorStyles.identityList}>
            {adMaterials.map((item) => (
              <AdMaterialIdentityCard
                key={item.adMaterialId}
                item={item}
                linkResolution={resolveAdMaterialPlatformVideo(item, platformVideoIndex)}
                canWrite={canWrite}
                onEdit={onEditAdMaterial}
              />
            ))}
          </div>
        )}
      </section>
      {asset ? (
        <div id="performance-summary">
          <PerformanceSnapshotSection
            asset={asset}
            performanceSnapshot={performanceSnapshot}
            shortVideoProfileHint={detail?.shortVideoProfileHint}
            enableDailyTrend
          />
        </div>
      ) : null}
    </div>
  );
}

function IdentitySummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className={inspectorStyles.identitySummaryCard}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function PlatformVideoIdentityCard({
  item,
  linkedMaterials,
  canWrite,
  onEdit,
}: {
  item: ContentAssetPlatformVideo;
  linkedMaterials: ContentAssetAdMaterial[];
  canWrite: boolean;
  onEdit: (item: ContentAssetPlatformVideo) => void;
}) {
  const linkedMaterialIds = linkedMaterials
    .map((material) => material.externalMaterialId)
    .filter(Boolean)
    .filter((externalMaterialId) => externalMaterialId !== item.externalItemId)
    .join('、');

  return (
    <article className={inspectorStyles.identityRecord}>
      <div className={inspectorStyles.identityRecordHeader}>
        <div className={inspectorStyles.identityRecordTitle}>
          <strong>{item.publishTitle || contentAssetPlatformLabel(item.platform)}</strong>
          <span>{item.accountName || item.accountId || item.advertiserId || '未填账户'}</span>
        </div>
        <div>
          <Tag className={inspectorStyles.identityTag}>{contentAssetPlatformLabel(item.platform)}</Tag>
          <Tag className={inspectorStyles.identityTag}>{publishStatusLabel(item.publishStatus)}</Tag>
        </div>
      </div>
      <div className={inspectorStyles.identityIdGrid}>
        <IdentityIdBlock label="抖音视频ID" value={item.externalVideoId} strong />
        <IdentityIdBlock label="千川素材ID" value={item.externalItemId} />
        <IdentityIdBlock label="素材库平台身份ID" value={item.platformVideoId} />
        <IdentityIdBlock label="小红书笔记ID" value={item.externalNoteId} />
        {linkedMaterialIds ? <IdentityIdBlock label="关联素材实例" value={linkedMaterialIds} /> : null}
      </div>
      <div className={inspectorStyles.identityRecordFooter}>
        <span className={inspectorStyles.identityRelationPill}>{relationStatusLabel(item.relationStatus)}</span>
        <span>{sourceLabel(item.source)}</span>
        {linkedMaterials.length ? (
          <span className={inspectorStyles.identityRelationPillMuted}>
            已关联 {linkedMaterials.length} 条素材实例
          </span>
        ) : null}
        {item.externalUrl ? (
          <a href={item.externalUrl} target="_blank" rel="noreferrer">
            <LinkOutlined /> 打开
          </a>
        ) : null}
        <Button size="small" type="text" icon={<EditOutlined />} disabled={!canWrite} onClick={() => onEdit(item)}>
          编辑
        </Button>
      </div>
    </article>
  );
}

function AdMaterialIdentityCard({
  item,
  linkResolution,
  canWrite,
  onEdit,
}: {
  item: ContentAssetAdMaterial;
  linkResolution: AdMaterialPlatformVideoResolution;
  canWrite: boolean;
  onEdit: (item: ContentAssetAdMaterial) => void;
}) {
  const linkedPlatformVideo = linkResolution.status === 'matched' ? linkResolution.platformVideo : undefined;
  const linkedVideoIdentity = linkedPlatformVideo ? platformVideoPrimaryId(linkedPlatformVideo) : undefined;
  const linkedVideoId = linkedVideoIdentity?.value;
  const linkedVideoLabel = linkedVideoIdentity ? `关联${linkedVideoIdentity.label}` : '关联平台身份';
  const shouldShowLinkedVideoIdentity =
    Boolean(linkedVideoId)
    && linkedVideoId !== item.externalVideoId
    && linkedVideoId !== item.externalMaterialId;
  const shouldShowMaterialVideoId =
    Boolean(item.externalVideoId)
    && normalizedIdentityKey(item.externalVideoId) !== normalizedIdentityKey(linkedPlatformVideo?.externalVideoId);
  const materialTitle =
    item.materialTitle || item.materialName || `${contentAssetPlatformLabel(item.adPlatform)}素材实例`;

  return (
    <article className={inspectorStyles.identityRecord}>
      <div className={inspectorStyles.identityRecordHeader}>
        <div className={inspectorStyles.identityRecordTitle}>
          <strong>{materialTitle}</strong>
          <span>{item.accountName || item.accountId || item.advertiserId || '未填账户'}</span>
        </div>
        <div>
          <Tag className={inspectorStyles.identityTag}>{contentAssetPlatformLabel(item.adPlatform)}</Tag>
          <Tag className={inspectorStyles.identityTag}>{materialStatusLabel(item.materialStatus)}</Tag>
        </div>
      </div>
      <div className={inspectorStyles.identityIdGrid}>
        <IdentityIdBlock label="千川素材ID" value={item.externalMaterialId} strong />
        {shouldShowMaterialVideoId ? <IdentityIdBlock label="抖音视频ID" value={item.externalVideoId} /> : null}
        {shouldShowLinkedVideoIdentity ? <IdentityIdBlock label={linkedVideoLabel} value={linkedVideoId} /> : null}
      </div>
      <div className={inspectorStyles.identityRecordFooter}>
        <span className={inspectorStyles.identityRelationPill}>{relationStatusLabel(item.relationStatus)}</span>
        <span>{sourceLabel(item.source)}</span>
        {linkResolution.status === 'ambiguous' ? (
          <span className={inspectorStyles.identityRelationPillMuted}>
            多条平台身份命中，请确认（{linkResolution.candidates.length} 条）
          </span>
        ) : linkedPlatformVideo ? (
          <span className={inspectorStyles.identityRelationPillMuted}>
            已关联 {contentAssetPlatformLabel(linkedPlatformVideo.platform)}
            {linkResolution.status === 'matched' && linkResolution.matchBy === 'externalVideoId' ? '（按视频ID匹配）' : ''}
            {linkResolution.status === 'matched' && linkResolution.matchBy === 'externalMaterialId' ? '（按素材ID匹配）' : ''}
          </span>
        ) : (
          <span className={inspectorStyles.identityRelationPillMuted}>待确认平台身份</span>
        )}
        <Button size="small" type="text" icon={<EditOutlined />} disabled={!canWrite} onClick={() => onEdit(item)}>
          编辑
        </Button>
      </div>
    </article>
  );
}

function IdentityIdBlock({
  label,
  value,
  strong,
}: {
  label: string;
  value: string | null | undefined;
  strong?: boolean;
}) {
  return (
    <div className={inspectorStyles.identityIdBlock}>
      <span>{label}</span>
      <code className={strong ? inspectorStyles.identityIdStrong : undefined}>{value || '--'}</code>
    </div>
  );
}

function publishStatusLabel(value: string | null | undefined): string {
  return resolveLabel(value, {
    unknown: '发布状态未知',
    draft: '草稿',
    pending: '待发布',
    published: '已发布',
    online: '已上线',
    offline: '已下线',
    deleted: '已删除',
  });
}

function materialStatusLabel(value: string | null | undefined): string {
  return resolveLabel(value, {
    unknown: '素材状态未知',
    pending: '待投放',
    active: '投放中',
    online: '在线',
    paused: '暂停',
    rejected: '审核拒绝',
    deleted: '已删除',
    archived: '已归档',
  });
}

function relationStatusLabel(value: string | null | undefined): string {
  return resolveLabel(value, {
    active: '已确认',
    pending_confirm: '待确认',
    rejected: '已排除',
    archived: '已归档',
  });
}

function sourceLabel(value: string | null | undefined): string {
  return resolveLabel(value, {
    manual: '人工维护',
    api_upload: '接口上传',
    api_import: '接口导入',
    report_import: '日报导入',
    fuzzy_match_confirmed: '模糊匹配确认',
  });
}

function resolveLabel(value: string | null | undefined, labels: Record<string, string>): string {
  if (!value) return '未知';
  return labels[value] || value;
}
