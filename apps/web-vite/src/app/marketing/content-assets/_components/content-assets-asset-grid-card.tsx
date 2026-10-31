import { Database, FileSearch, Play, Upload } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type { ContentAssetItem, ContentAssetProcessingJob } from '../_lib/content-assets-types';
import {
  resolveContentAssetDisplayTitle,
  resolveContentAssetProductText,
  resolveContentAssetTagChips,
  resolveContentAssetTitleHint,
} from '../_lib/content-assets-display';
import { contentAssetPlatformNamesLabel } from '../_lib/content-assets-platforms';
import { formatDuration } from '../_lib/content-assets-formatters';
import { contentAssetStatusLabel } from '../_lib/content-assets-ui-helpers';
import cardStyles from './content-assets-asset-list.module.css';
import { ContentAssetPreviewMedia } from './content-assets-preview-media';
import {
  type AssetCardPill,
  type IntelligencePillState,
  resolveIntelligencePills,
} from './content-assets-asset-intelligence';

const COVER_TONES = [
  cardStyles.coverToneBlue,
  cardStyles.coverToneCyan,
  cardStyles.coverToneSlate,
  cardStyles.coverToneWarm,
];

export function ContentAssetGridCard({
  asset,
  index,
  isPreviewActive,
  processingJobs,
  onOpen,
  onPreviewActivate,
  onPreviewDeactivate,
  onSourceUploadOpen,
  resolvePills,
  openLabel = '打开素材详情',
}: {
  asset: ContentAssetItem;
  index: number;
  isPreviewActive: boolean;
  processingJobs: ContentAssetProcessingJob[];
  onOpen: (asset: ContentAssetItem) => void;
  onPreviewActivate: (assetId: string) => void;
  onPreviewDeactivate: (assetId: string) => void;
  /** Omit to hide the 补传源文件 action (for example in AI 创作中心). */
  onSourceUploadOpen?: (asset: ContentAssetItem) => void;
  /** Replaces the default AI/script readiness pills. */
  resolvePills?: (asset: ContentAssetItem) => AssetCardPill[];
  openLabel?: string;
}) {
  const cardTags = resolveCardTags(asset);
  const displayTitle = resolveContentAssetDisplayTitle(asset);
  const statusLabel = resolveCardStatusLabel(asset);
  const canSourceUpload = Boolean(onSourceUploadOpen) && asset.externalOnly && asset.canEdit;
  const pills = resolvePills ? resolvePills(asset) : resolveIntelligencePills(asset, processingJobs);
  const meta = resolveCardMeta(asset);

  return (
    <article
      className={cardStyles.assetCard}
      key={asset.assetId}
      style={{ '--asset-card-index': index } as CSSProperties}
      onClick={() => onOpen(asset)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (isActionKey(event)) {
          event.preventDefault();
          onOpen(asset);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${openLabel}：${displayTitle}`}
    >
      <div
        className={`${cardStyles.coverFrame} ${asset.coverUrl ? cardStyles.coverFrameWithImage : COVER_TONES[index % COVER_TONES.length]} ${isPreviewActive ? cardStyles.coverFramePreviewing : ''}`}
      >
        <AssetCoverVisual
          asset={asset}
          displayTitle={displayTitle}
          isPreviewActive={isPreviewActive}
          onPreviewActivate={onPreviewActivate}
          onPreviewDeactivate={onPreviewDeactivate}
        />
        <span className={cardStyles.durationBadge}>{formatDuration(asset.durationSeconds)}</span>
        {statusLabel ? <span className={cardStyles.statusBadge}>{statusLabel}</span> : null}
      </div>
      <div className={cardStyles.cardBody}>
        <div className={cardStyles.cardTitleRow}>
          <h3 title={resolveContentAssetTitleHint(asset)}>{displayTitle}</h3>
        </div>
        {meta ? <p className={cardStyles.cardMeta}>{meta}</p> : null}
        {/* Tags and readiness share one row so the scrim carries at most three lines of text. */}
        {cardTags.length + pills.length > 0 ? (
          <div className={cardStyles.chipRow}>
            {cardTags.map((tag) => (
              <span className={tag.source === 'ai' ? cardStyles.aiTag : ''} key={`${tag.source}:${tag.label}`}>
                {tag.source === 'ai' ? 'AI ' : ''}{tag.label}
              </span>
            ))}
            {pills.map((pill) => (
              <span className={readinessPillClassName(pill.state)} key={`pill:${pill.label}`}>
                {pill.label}
              </span>
            ))}
          </div>
        ) : null}
        {canSourceUpload ? (
          <button
            className={cardStyles.sourceUploadButton}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSourceUploadOpen?.(asset);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Upload size={14} strokeWidth={1.8} aria-hidden="true" />
            补传源文件
          </button>
        ) : null}
      </div>
    </article>
  );
}

function AssetCoverVisual({
  asset,
  displayTitle,
  isPreviewActive,
  onPreviewActivate,
  onPreviewDeactivate,
}: {
  asset: ContentAssetItem;
  displayTitle: string;
  isPreviewActive: boolean;
  onPreviewActivate: (assetId: string) => void;
  onPreviewDeactivate: (assetId: string) => void;
}) {
  if (asset.coverUrl) {
    return (
      <ContentAssetPreviewMedia
        asset={asset}
        displayTitle={displayTitle}
        isActive={isPreviewActive}
        onActivate={onPreviewActivate}
        onDeactivate={onPreviewDeactivate}
      />
    );
  }

  return (
    <div className={cardStyles.coverVisual}>
      <span className={cardStyles.coverPlay}>
        {asset.coverObjectKey ? <Play size="1em" strokeWidth={1.8} aria-hidden="true" fill="currentColor" /> : <Database size="1em" strokeWidth={1.8} aria-hidden="true" />}
      </span>
      <div className={cardStyles.coverTimeline} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <span className={cardStyles.coverStatePill}>
        {asset.coverObjectKey ? <FileSearch size={14} strokeWidth={1.8} aria-hidden="true" /> : null}
        {asset.coverObjectKey ? ' ' : ''}
        {resolveCoverStateLabel(asset)}
      </span>
    </div>
  );
}

function resolveCoverStateLabel(asset: ContentAssetItem): string {
  if (asset.externalOnly) return '待补源文件';
  if (asset.coverObjectKey) return '封面已生成';
  if (asset.rawObjectKey) return '原片已入库，待生成封面';
  return '待生成预览';
}

function resolveCardStatusLabel(asset: ContentAssetItem): string | null {
  if (asset.externalOnly) return '待补源';
  if (asset.assetStatus === 'ready') return null;
  return contentAssetStatusLabel(asset.assetStatus);
}

/** Platform, product and creator; nothing when none is known (no placeholder over the cover). */
function resolveCardMeta(asset: ContentAssetItem): string | null {
  const values = [contentAssetPlatformNamesLabel(asset.platformNames, asset.platform), resolveContentAssetProductText(asset), asset.creatorName]
    .filter((value) => value && value !== '--');
  if (values.length > 0) return values.join(' · ');
  return null;
}

function readinessPillClassName(state: IntelligencePillState): string {
  if (state === 'ready') return cardStyles.readinessPillReady;
  if (state === 'active') return cardStyles.readinessPillActive;
  if (state === 'failed') return cardStyles.readinessPillFailed;
  return '';
}

function resolveCardTags(asset: ContentAssetItem) {
  const labels = [
    ...resolveContentAssetTagChips(asset, 2),
    asset.sourceSheetName ? { label: asset.sourceSheetName, source: 'system' as const } : null,
  ].filter((label): label is { label: string; source: 'asset' | 'ai' | 'system' } => Boolean(label?.label));

  const seen = new Set<string>();
  return labels.filter((item) => {
    if (seen.has(item.label)) return false;
    seen.add(item.label);
    return true;
  }).slice(0, 2);
}

function isActionKey(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key === 'Enter' || event.key === ' ';
}
