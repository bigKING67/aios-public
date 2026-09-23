import { Button } from 'antd';
import type { ContentAssetDetailResponse } from '../_lib/content-assets-types';
import { resolveContentAssetProductText } from '../_lib/content-assets-display';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
} from '../_lib/content-assets-formatters';
import { contentAssetPlatformNamesLabel } from '../_lib/content-assets-platforms';
import {
  authorizationStatusLabel,
  contentAssetVideoTypeLabel,
  isContentAssetSceneVideoType,
  profileStatusLabel,
  scenePathFromContentAsset,
} from '../_lib/content-assets-ui-helpers';
import {
  resolveCreatorAccountIdSummary,
  resolveCreatorNameSummary,
} from '../_lib/content-assets-identity-summary';
import styles from '../content-assets.module.css';
import inspectorStyles from './content-assets-inspector.module.css';
import { DetailItem } from './content-assets-inspector-detail-item';
import { AssetStatusTag, LifecycleStatusTag } from './content-assets-status-tags';

export function BaseInfoTab({
  detail,
  onOpenDataMapping,
}: {
  detail: ContentAssetDetailResponse | null;
  onOpenDataMapping?: () => void;
}) {
  const asset = detail?.asset;
  if (!asset) return null;
  const shortVideoProfileHint = detail.shortVideoProfileHint ?? null;
  const creatorNameSummary = resolveCreatorNameSummary(detail);
  const creatorAccountIdSummary = resolveCreatorAccountIdSummary(detail);
  const effectiveVideoType = asset.videoType || shortVideoProfileHint?.videoType || null;
  const sceneInfo = resolveBaseInfoScene(detail);
  const showSceneDetails = isContentAssetSceneVideoType(effectiveVideoType) || Boolean(sceneInfo.path?.length);
  const isShortVideoHintDisplay = sceneInfo.source === 'shortVideoHint'
    || sceneInfo.source === 'mixed'
    || (!asset.videoType && Boolean(shortVideoProfileHint?.videoType));
  const showAmbiguousSceneWarning = shortVideoProfileHint?.matchStatus === 'ambiguous';
  const skuText = asset.skuNames?.length ? asset.skuNames.join(' / ') : '--';
  const ownerText = asset.ownerName || asset.ownerUserId || '--';
  const platformVideoCount = detail.platformVideos?.length ?? 0;
  const adMaterialCount = detail.adMaterials?.length ?? 0;
  const performanceSnapshot = detail.performanceSnapshot ?? null;
  const materialSnapshotCount = performanceSnapshot?.totals?.materialCount ?? performanceSnapshot?.materials?.length ?? 0;
  const mappingSummary = [
    `${platformVideoCount} 条平台身份`,
    `${adMaterialCount} 条投放实例`,
    materialSnapshotCount > 0 ? `${materialSnapshotCount} 个快照 material_id` : '暂无投放快照',
  ].join(' / ');

  return (
    <div className={styles.detailStack}>
      <section className={styles.detailSection}>
        <h3>内容定位</h3>
        <div className={styles.detailGrid}>
          <DetailItem label="档案状态" value={profileStatusLabel(asset.profileStatus)} />
          <DetailItem label="流转阶段" value={<LifecycleStatusTag value={asset.lifecycleStatus} />} />
          <DetailItem label="视频类型" value={contentAssetVideoTypeLabel(effectiveVideoType)} />
          {showSceneDetails ? (
            <>
              <DetailItem label="场景类型" value={sceneInfo.path?.[0] || '--'} />
              <DetailItem label="大场景" value={sceneInfo.path?.[1] || '--'} />
              <DetailItem label="细分场景" value={sceneInfo.path?.[2] || '--'} />
            </>
          ) : null}
        </div>
        {isShortVideoHintDisplay && !showAmbiguousSceneWarning ? (
          <p className={styles.detailInlineNote}>
            视频类型/场景来自挂车短视频明细中可唯一确认的回流字段；保存档案后会固化到素材库。
          </p>
        ) : null}
        {showAmbiguousSceneWarning ? (
          <p className={styles.detailInlineWarning}>
            挂车短视频明细命中多条记录；这里仅显示可唯一确认的回流字段，冲突字段需在“编辑档案”里人工确认后再固化。
          </p>
        ) : null}
      </section>
      <section className={styles.detailSection}>
        <h3>商品与达人</h3>
        <div className={styles.detailGrid}>
          <DetailItem label="平台" value={contentAssetPlatformNamesLabel(asset.platformNames, asset.platform)} />
          <DetailItem label="产品" value={resolveContentAssetProductText(asset) || '--'} />
          <DetailItem label="SKU" value={skuText} />
          <DetailItem label="达人昵称" value={creatorNameSummary} />
          <DetailItem label="达人账号" value={creatorAccountIdSummary} />
          <DetailItem label="负责人" value={ownerText} />
        </div>
      </section>
      <section className={styles.detailSection}>
        <h3>使用边界</h3>
        <div className={styles.detailGrid}>
          <DetailItem label="授权" value={authorizationStatusLabel(asset.authorizationStatus)} />
          <DetailItem label="可商用" value={nullableBooleanLabel(asset.commercialUseAllowed)} />
          <DetailItem label="可复剪" value={nullableBooleanLabel(asset.repurposeAllowed)} />
        </div>
        <p className={styles.detailNote}>
          {asset.notes || '授权、商用和复剪边界会作为 AI 复剪建议的业务约束，不参与投放数据回流匹配。'}
        </p>
      </section>
      <section className={styles.detailSection}>
        <div className={inspectorStyles.sectionTitleRow}>
          <h3>数据映射摘要</h3>
          {onOpenDataMapping ? (
            <Button size="small" onClick={onOpenDataMapping}>
              去数据映射维护
            </Button>
          ) : null}
        </div>
        <p className={styles.detailInlineNote}>
          {mappingSummary}。抖音视频 ID、千川 material_id、投放快照和原始证据统一在“数据映射”维护。
        </p>
      </section>
      <details className={inspectorStyles.technicalDetails}>
        <summary>
          <span>技术信息</span>
          <small>Asset ID / 文件规格 / 存储对象</small>
        </summary>
        <div className={styles.detailStack}>
          <section className={styles.detailSection}>
            <h3>文件信息</h3>
            <div className={styles.detailGrid}>
              <DetailItem label="内部 Asset ID" value={asset.assetId} />
              <DetailItem label="文件状态" value={<AssetStatusTag value={asset.assetStatus} />} />
              <DetailItem label="文件大小" value={formatBytes(asset.fileSizeBytes)} />
              <DetailItem label="预览大小" value={formatBytes(asset.previewSizeBytes)} />
              <DetailItem label="分辨率" value={asset.width && asset.height ? `${asset.width} x ${asset.height}` : '--'} />
              <DetailItem label="时长" value={formatDuration(asset.durationSeconds)} />
              <DetailItem label="格式" value={(asset.fileExt || asset.mimeType || '--').toUpperCase()} />
              <DetailItem label="上传时间" value={formatDateTime(asset.uploadedAt)} />
              <DetailItem label="来源表" value={asset.sourceSheetName || '--'} />
            </div>
          </section>
          <section className={styles.detailSection}>
            <h3>存储对象</h3>
            <div className={inspectorStyles.objectList}>
              {(detail?.objects || []).length === 0 ? <p>暂无对象明细，兼容读取主表 object key。</p> : null}
              {(detail?.objects || []).map((object) => (
                <article key={object.objectId} className={inspectorStyles.objectItem}>
                  <strong>{object.objectRole}</strong>
                  <span>{object.bucket}</span>
                  <code>{object.objectKey}</code>
                </article>
              ))}
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}

function nullableBooleanLabel(value: boolean | null | undefined): string {
  if (value == null) return '待确认';
  return value ? '允许' : '限制';
}

function normalizeShortVideoHintText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function shortVideoHintSceneSegments(
  hint: ContentAssetDetailResponse['shortVideoProfileHint']
): Array<string | undefined> {
  if (!hint) {
    return [];
  }

  return [
    normalizeShortVideoHintText(hint.contentScene),
    normalizeShortVideoHintText(hint.contentSceneGroup),
    normalizeShortVideoHintText(hint.contentSceneSubtype),
  ].map((value) => value || undefined);
}

function resolveBaseInfoScene(detail: ContentAssetDetailResponse): {
  path?: string[];
  source: 'asset' | 'shortVideoHint' | 'mixed' | 'none';
} {
  const assetScenePath = scenePathFromContentAsset(detail.asset);
  const hintSegments = shortVideoHintSceneSegments(detail.shortVideoProfileHint);
  const mergedPath = [0, 1, 2]
    .map((index) => assetScenePath?.[index] || hintSegments[index])
    .filter((value): value is string => Boolean(value));
  const hasAssetScene = Boolean(assetScenePath?.length);
  const usesHint = [0, 1, 2].some((index) => !assetScenePath?.[index] && Boolean(hintSegments[index]));

  if (!mergedPath.length) {
    return { source: 'none' };
  }

  if (hasAssetScene && usesHint) {
    return { path: mergedPath, source: 'mixed' };
  }

  return {
    path: mergedPath,
    source: hasAssetScene ? 'asset' : 'shortVideoHint',
  };
}
