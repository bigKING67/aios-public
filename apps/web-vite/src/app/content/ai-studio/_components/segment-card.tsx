import { useQuery } from '@tanstack/react-query';
import { Checkbox, Select } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssetCardPill } from '@/app/marketing/content-assets/_components/content-assets-asset-intelligence';
import { createContentAssetPlaybackUrl } from '@/app/marketing/content-assets/_lib/content-assets-api';
import type { StudioContentSegment, StudioSegmentPreset } from '../_lib/ai-studio-api';
import { findPreset, isSegmentReadOnly, labelName } from '../_lib/segment-display';
import { hasSegmentProduct, resolveSegmentPills } from '../_lib/segment-pills';
import { buildSegmentAnnotationPath } from '../_lib/segment-routes';
import { formatSegmentDuration, formatSegmentTime } from '../_lib/segment-time';
import styles from './segment-library.module.css';

function pillToneClass(pill: AssetCardPill): string {
  if (pill.state === 'ready') return styles.pillReady;
  if (pill.state === 'active') return styles.pillActive;
  if (pill.state === 'failed') return styles.pillWarning;
  return '';
}

interface SegmentCardProps {
  segment: StudioContentSegment;
  presets: readonly StudioSegmentPreset[];
  coverUrl: string | null;
  /** Used when `coverUrl` (the segment's own frame) fails to load. */
  fallbackCoverUrl?: string | null;
  selected: boolean;
  /** Batch mode: the card shows its checkbox and a click toggles selection instead of opening it. */
  selectable?: boolean;
  canWrite: boolean;
  busy: boolean;
  /** Status/origin pills; off in the default confirmed-only view where they carry no information. */
  showStatus?: boolean;
  /** Choices for the inline 补填产品 picker. */
  productOptions: readonly { label: string; value: string }[];
  onSelectedChange: (segmentId: string, selected: boolean) => void;
  onSetProduct: (segment: StudioContentSegment, productName: string) => void;
}

/**
 * A segment card: its opening frame (hover plays only its range), then the
 * label and time range as the headline and the source original as context.
 */
export function SegmentCard({
  segment,
  presets,
  coverUrl: preferredCover,
  fallbackCoverUrl = null,
  selected,
  selectable = false,
  canWrite,
  busy,
  showStatus = true,
  productOptions,
  onSelectedChange,
  onSetProduct,
}: SegmentCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUrl = coverFailed || !preferredCover ? fallbackCoverUrl : preferredCover;
  const navigate = useNavigate();
  const [previewing, setPreviewing] = useState(false);
  const label = labelName(findPreset(presets, segment.presetKey, segment.presetVersion), segment.labelKey);
  const editable = canWrite && !isSegmentReadOnly(segment);
  const open = () => navigate(buildSegmentAnnotationPath(segment.assetId, segment.segmentId));
  const checkable = selectable && editable;
  const activate = () => {
    if (!selectable) open();
    else if (checkable) onSelectedChange(segment.segmentId, !selected);
  };
  const missingProduct = !hasSegmentProduct(segment) && !isSegmentReadOnly(segment) && segment.status !== 'rejected';
  const pills = showStatus ? resolveSegmentPills(segment) : [];

  return (
    <article
      className={`${styles.segmentCard} ${selected ? styles.segmentCardSelected : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${selectable ? (selected ? '取消选择' : '选择') : '打开片段标注'}：${segment.assetTitle} ${label} ${formatSegmentTime(segment.startMs)}–${formatSegmentTime(segment.endMs)}`}
      aria-pressed={selectable ? selected : undefined}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }}
      onMouseEnter={() => setPreviewing(true)}
      onMouseLeave={() => setPreviewing(false)}
    >
      <div className={styles.segmentCover}>
        {coverUrl ? (
          <img className={styles.coverMedia} src={coverUrl} alt="" loading="lazy" onError={() => setCoverFailed(true)} />
        ) : null}
        {previewing ? <SegmentClipVideo segment={segment} /> : null}
        <span className={styles.segmentDuration}>{formatSegmentDuration(segment.startMs, segment.endMs)}</span>
        {checkable ? (
          <span className={styles.selectBox} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            <Checkbox
              aria-label={`选择片段：${segment.assetTitle} ${label}`}
              checked={selected}
              onChange={(event) => onSelectedChange(segment.segmentId, event.target.checked)}
            />
          </span>
        ) : null}
      </div>
      <div className={styles.segmentBody}>
        <p className={styles.segmentHeadline}>
          <strong>{label}</strong>
          <span>
            {formatSegmentTime(segment.startMs)}–{formatSegmentTime(segment.endMs)}
          </span>
        </p>
        <p className={styles.segmentSource} title={segment.assetTitle}>
          {segment.assetTitle}
        </p>
        {pills.length > 0 || missingProduct ? (
          <div className={styles.segmentPills}>
            {pills.map((pill) => (
              <span className={`${styles.segmentPill} ${pillToneClass(pill)}`} key={pill.label}>{pill.label}</span>
            ))}
            {missingProduct && !pills.some((pill) => pill.label.startsWith('缺产品')) ? (
              <span className={`${styles.segmentPill} ${styles.pillWarning}`}>缺产品，无法混剪</span>
            ) : null}
          </div>
        ) : null}
        {editable && missingProduct ? (
          <div className={styles.cardActions} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            <Select
              className={styles.productSelect}
              size="small"
              showSearch
              placeholder="补填产品"
              aria-label="补填产品"
              disabled={busy}
              options={[...productOptions]}
              onChange={(value: string) => onSetProduct(segment, value)}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Plays the raw source (segment times are raw-source milliseconds) looped within the segment. */
function SegmentClipVideo({ segment }: { segment: StudioContentSegment }) {
  const playback = useQuery({
    queryKey: ['content-ai-studio', 'playback', segment.assetId, 'raw'],
    queryFn: () => createContentAssetPlaybackUrl(segment.assetId, 'raw'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (!playback.data) return null;
  const start = segment.startMs / 1000;
  const end = segment.endMs / 1000;
  return (
    <video
      className={styles.coverMedia}
      src={`${playback.data.url}#t=${start},${end}`}
      muted
      autoPlay
      playsInline
      preload="metadata"
      aria-hidden
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (video.currentTime >= end || video.currentTime < start - 0.5) {
          video.currentTime = start;
          void video.play().catch(() => undefined);
        }
      }}
    />
  );
}
