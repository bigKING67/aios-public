import { FileImageOutlined, PlayCircleFilled } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Modal, Skeleton } from 'antd';
import { useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { createContentAssetPlaybackUrl } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { formatDuration } from '@/app/marketing/content-assets/_lib/content-assets-formatters';
import { resolveContentAssetRequestError } from '@/app/marketing/content-assets/_lib/content-assets-ui-helpers';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import { groupRemixCandidates, shortAssetTitle, type RemixCandidateSegment } from '../_lib/remix-form';
import type { StudioRemixBatchPreviewResponse } from '../_lib/remix-api';
import { labelName } from '../_lib/segment-display';
import { useRangePlayback } from './use-range-playback';
import { useRemixConfirmedSegments } from './use-remix-batches';
import styles from './segment-annotation.module.css';
import remixStyles from './remix.module.css';

function rangeText(segment: RemixCandidateSegment): string {
  return `${formatDuration(segment.startMs / 1000)}–${formatDuration(segment.endMs / 1000)}`;
}

export interface RangePlayerSource {
  assetId: string;
  startMs: number;
  endMs: number;
  coverUrl: string | null;
  /** Accessible description, e.g. the original's title and range. */
  label: string;
}

/** Plays one interval of an original and stops at the out-point (candidates, 剪辑台 previews). */
export function SegmentRangePlayer({ source }: { source: RangePlayerSource }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playback = useRangePlayback(videoRef);
  // Shared with the annotation player so an opened original is not re-signed; the
  // signed URL expires, so a media error fetches a fresh one once.
  const url = useQuery({
    queryKey: ['content-ai-studio', 'playback', source.assetId, 'raw'],
    queryFn: () => createContentAssetPlaybackUrl(source.assetId, 'raw'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [renewed, setRenewed] = useState(false);
  const [broken, setBroken] = useState(false);
  if (url.isPending) return <Skeleton.Node active className={styles.playerSkeleton} />;
  if (url.isError) return <Alert type="error" showIcon title="播放地址生成失败" description={resolveContentAssetRequestError(url.error)} />;
  if (broken) return <Alert type="error" showIcon title="视频无法播放" description="播放地址已失效或原片不可读，请关闭后重新打开。" />;
  return (
    <video
      ref={videoRef}
      className={remixStyles.candidateVideo}
      src={url.data.url}
      poster={source.coverUrl || undefined}
      controls
      playsInline
      preload="metadata"
      aria-label={`片段播放器：${source.label}`}
      onLoadedMetadata={() => playback.playRange(source.startMs, source.endMs)}
      onTimeUpdate={playback.onTimeUpdate}
      onSeeking={playback.onSeeking}
      onError={() => {
        if (renewed) {
          setBroken(true);
          return;
        }
        setRenewed(true);
        void url.refetch();
      }}
    />
  );
}

interface RemixCandidatesProps {
  preset: StudioSegmentPreset;
  preview: StudioRemixBatchPreviewResponse;
}

/**
 * The confirmed segments each framework draws from, so a batch is not a black
 * box. Repeated frameworks share one pool; a click plays the segment in place.
 */
export function RemixCandidates({ preset, preview }: RemixCandidatesProps) {
  const segments = useRemixConfirmedSegments(preset, true);
  const [playing, setPlaying] = useState<RemixCandidateSegment | null>(null);

  if (segments.isPending) return <Skeleton active paragraph={{ rows: 3 }} title={false} />;
  if (segments.isError) return <Alert type="error" showIcon title="候选片段读取失败，请刷新后重试。" />;

  const groups = groupRemixCandidates(preview.slots, segments.data.items, preview.productName, preset.version);

  return (
    <div className={remixStyles.stack}>
      {groups.map((group) => {
        const name = labelName(preset, group.labelKey);
        const unusable = group.segments.length - group.expectedCount;
        return (
          <section key={group.labelKey} className={remixStyles.candidateGroup} aria-label={`候选片段：${name}`}>
            <div className={remixStyles.candidateHead}>
              <span className={remixStyles.slotName}>{name}</span>
              <span className={remixStyles.slotCount}>
                第 {group.ordinals.join('、')} 位{group.ordinals.length > 1 ? '共用' : ''} · {group.expectedCount} 段
              </span>
              {unusable > 0 ? (
                <span className={remixStyles.candidateNote}>其中 {unusable} 段因原片授权受限、无编辑权限或超出候选上限，不会被选用</span>
              ) : null}
            </div>
            {group.segments.length === 0 ? (
              <p className={styles.fieldHelp}>
                还没有可用的「{name}」片段。{' '}
                <RouterLink className={remixStyles.gapLink} to={ROUTE_PATHS.contentAiStudioSegments}>
                  去片段素材
                </RouterLink>
              </p>
            ) : (
              <ul className={remixStyles.candidateStrip}>
                {group.segments.map((segment) => (
                  <li key={segment.segmentId}>
                    <button
                      type="button"
                      className={remixStyles.candidate}
                      title={`${segment.assetTitle} · ${rangeText(segment)}`}
                      aria-label={`播放 ${segment.assetTitle} ${rangeText(segment)}`}
                      onClick={() => setPlaying(segment)}
                    >
                      <span className={remixStyles.candidateCover}>
                        {segment.coverUrl ? <img src={segment.coverUrl} alt="" loading="lazy" /> : <FileImageOutlined aria-hidden />}
                        <PlayCircleFilled className={remixStyles.candidatePlay} aria-hidden />
                        <span className={remixStyles.candidateDuration}>
                          {formatDuration((segment.endMs - segment.startMs) / 1000)}
                        </span>
                      </span>
                      <span className={remixStyles.candidateTitle}>{shortAssetTitle(segment.assetTitle)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {segments.data.truncated ? (
        <p className={styles.fieldHelp}>已确认片段较多，这里只列出前 1000 段中的匹配项；生成时仍按全部可用片段组合。</p>
      ) : null}
      <Modal
        open={playing !== null}
        title={playing ? `${labelName(preset, playing.labelKey)} · ${playing.assetTitle}（${rangeText(playing)}）` : ''}
        footer={null}
        width={420}
        destroyOnHidden
        onCancel={() => setPlaying(null)}
      >
        {playing ? (
          <SegmentRangePlayer
            key={playing.segmentId}
            source={{ ...playing, label: `${playing.assetTitle} ${rangeText(playing)}` }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
