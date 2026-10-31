import { Alert, Button, Skeleton, SkeletonText } from '@lobehub/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, CirclePlay } from 'lucide-react';
import { type RefObject, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import { createContentAssetPlaybackUrl } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { resolveContentAssetRequestError } from '@/app/marketing/content-assets/_lib/content-assets-ui-helpers';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import {
  REMIX_REVIEW_LABELS,
  remixBatchOwnerLabel,
  remixItemReviewState,
  remixModeLabel,
  type StudioRemixBatchDetail,
  type StudioRemixBatchItem,
  type StudioRemixOutputReviewRequest,
} from '../_lib/remix-api';
import { filterRemixItemsByReviewArchive, isRejectedRemixItem, isRemixItemPlaybackAvailable } from '../_lib/remix-review';
import {
  buildOutputsListPath,
  buildRemixBatchPath,
  buildRemixOutputPath,
  OUTPUTS_REJECTED,
  OUTPUTS_REVIEW_PARAM,
  outputsListParams,
} from '../_lib/remix-routes';
import { findPreset } from '../_lib/segment-display';
import { formatSegmentDuration } from '../_lib/segment-time';
import { formatShortTimestamp } from '../_lib/studio-time';
import { frozenAdmissionSummary } from '../_lib/source-spend';
import { Lineage } from './remix-batch-detail';
import { RemixOutputTimeline } from './remix-output-timeline';
import { RemixPictureReview } from './remix-picture-review';
import { RemixQcSummary } from './remix-qc-summary';
import { RemixDeliveryStatus } from './remix-delivery';
import { ReviewPanel } from './remix-review-panel';
import { RemixItemStatus } from './remix-status';
import { RefreshButton } from './refresh-button';
import pageStyles from '../ai-studio.module.css';
import annotationStyles from './segment-annotation.module.css';
import outputStyles from './remix-outputs.module.css';
import remixStyles from './remix.module.css';

interface RemixOutputReviewViewProps {
  detail: StudioRemixBatchDetail | undefined;
  ordinal: number;
  presets: readonly StudioSegmentPreset[];
  openAccess: boolean;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  /** A request approves or rejects; null clears the review. */
  onReview: (request: StudioRemixOutputReviewRequest | null) => void;
  reviewing: boolean;
  reviewError: string | null;
  onRetryDelivery: () => void;
  deliveryRetrying: boolean;
  deliveryError: string | null;
}

/** The output's video through the library's signed playback URL, with download under it. */
function OutputPlayer({
  item,
  videoRef,
  onTime,
  onDuration,
}: {
  item: StudioRemixBatchItem;
  videoRef: RefObject<HTMLVideoElement | null>;
  onTime: (ms: number) => void;
  onDuration: (ms: number | null) => void;
}) {
  const assetId = isRemixItemPlaybackAvailable(item) ? item.outputAssetId : null;
  const playback = useQuery({
    queryKey: ['content-ai-studio', 'remix-output-playback', assetId],
    queryFn: () => createContentAssetPlaybackUrl(assetId!, 'raw'),
    enabled: assetId !== null,
    // A refetch would swap `src` and reset the playhead.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (!assetId) {
    return (
      <div className={annotationStyles.playerEmpty}>
        <CirclePlay size={14} strokeWidth={1.8} aria-hidden />
        <p>
          {item.outputDeleted
            ? isRejectedRemixItem(item)
              ? item.retention?.canRestore
                ? '这条已驳回成片当前不可播放；仍可在撤回期内恢复为待审核。'
                : item.retention?.status === 'completed' || item.retention?.cleanedAt
                  ? '这条已驳回成片的本地文件已清理，无法再播放或下载。'
                  : '这条已驳回成片当前不可播放或下载；审核与来源记录仍会保留。'
              : '这条成片已删除，无法再播放或下载。'
            : item.outcome === 'running'
              ? '成片还在生成，完成后可在这里播放和审核。'
              : item.outcome === 'succeeded'
                ? '这条成片没有可播放的文件。'
                : '这条成片没有生成成功，没有可播放的文件。'}
        </p>
      </div>
    );
  }
  return (
    <div className={annotationStyles.player}>
      {playback.isPending ? <Skeleton className={annotationStyles.playerSkeleton} /> : null}
      {playback.isError ? (
        <Alert type="error" showIcon title="播放地址获取失败" description={resolveContentAssetRequestError(playback.error)} />
      ) : null}
      {playback.data ? (
        <video
          ref={videoRef}
          className={annotationStyles.video}
          src={playback.data.url}
          poster={item.outputCoverUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          aria-label={`第 ${item.ordinal} 条成片`}
          onTimeUpdate={(event) => onTime(Math.round(event.currentTarget.currentTime * 1000))}
          onSeeking={(event) => onTime(Math.round(event.currentTarget.currentTime * 1000))}
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration;
            onDuration(Number.isFinite(seconds) ? Math.round(seconds * 1000) : null);
          }}
        >
          <track kind="captions" />
        </video>
      ) : null}
      <div className={annotationStyles.playerMeta}>
        {playback.data ? (
          <a className={annotationStyles.tableLink} href={playback.data.url} target="_blank" rel="noreferrer" download>
            下载成片
          </a>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 成片审核: one output on the 片段标注 layout — the vertical video in its 320px column, and in
 * the work column the output's status, AI hints, its timeline, where each segment came from and
 * the review. 上一条 / 下一条 walk the batch so a batch of ten is reviewed in one pass.
 */
export function RemixOutputReviewView({
  detail,
  ordinal,
  presets,
  openAccess,
  loading,
  error,
  refreshing,
  onRefresh,
  onReview,
  reviewing,
  reviewError,
  onRetryDelivery,
  deliveryRetrying,
  deliveryError,
}: RemixOutputReviewViewProps) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const list = outputsListParams(params);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [videoMs, setVideoMs] = useState<number | null>(null);
  const items = detail?.items ?? [];
  const item = items.find((candidate) => candidate.ordinal === ordinal);
  const rejectedArchive = params.get(OUTPUTS_REVIEW_PARAM) === OUTPUTS_REJECTED;
  const navigationItems = filterRemixItemsByReviewArchive(items, rejectedArchive);
  const navigationIndex = navigationItems.findIndex((candidate) => candidate.ordinal === ordinal);
  // A single-output batch has no batch page worth a stop: back goes to the list.
  const single = items.length === 1;
  const back = detail && !single ? (
    <RouterLink className={annotationStyles.backLink} to={buildRemixBatchPath(detail.batch.batchId, list)}>
      <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> 返回批次
    </RouterLink>
  ) : (
    <RouterLink className={annotationStyles.backLink} to={buildOutputsListPath(list)}>
      <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> 全部批次
    </RouterLink>
  );
  if (error) {
    return (
      <div className={remixStyles.stack}>
        {back}
        <Alert type="error" showIcon title="成片读取失败" description={error} action={<Button onClick={onRefresh}>重试</Button>} />
      </div>
    );
  }
  if (!detail) return loading ? <SkeletonText rows={6} /> : null;
  if (!item) {
    return (
      <div className={remixStyles.stack}>
        {back}
        <Alert type="warning" showIcon title={`这个批次没有第 ${ordinal} 条成片`} />
      </div>
    );
  }
  const { batch } = detail;
  const preset = findPreset(presets, batch.presetKey, batch.presetVersion);
  const durationMs = videoMs ?? item.durationMs;
  const playable = isRemixItemPlaybackAvailable(item);
  const seek = (ms: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    setCurrentMs(ms);
    try {
      void video.play()?.catch(() => undefined);
    } catch {
      // Playback can be refused (autoplay policy); the playhead still moved.
    }
  };
  const previous = navigationIndex >= 0 ? navigationItems[navigationIndex - 1] : undefined;
  const next = navigationIndex >= 0 ? navigationItems[navigationIndex + 1] : undefined;
  const nextPending = rejectedArchive || navigationIndex < 0
    ? undefined
    : navigationItems.slice(navigationIndex + 1).concat(navigationItems.slice(0, navigationIndex)).find((candidate) => remixItemReviewState(candidate) === 'pending');
  const admission = frozenAdmissionSummary(item.segments);
  const meta = [
    `时长 ${formatSegmentDuration(0, durationMs)}`,
    `${item.segments.length} 段`,
    admission?.label,
    openAccess ? `发起人：${remixBatchOwnerLabel(batch)}` : null,
    formatShortTimestamp(batch.createdAt),
  ].filter(Boolean).join(' · ');
  return (
    <div className={remixStyles.stack}>
      {back}
      <article className={pageStyles.card} aria-labelledby="remix-output-title">
        <div className={annotationStyles.cardHeading}>
          <h2 id="remix-output-title">
            {batch.productName} · 第 {item.ordinal} 条{items.length > 1 ? ` / 共 ${items.length} 条` : ''}
          </h2>
          <span className={annotationStyles.rowActions}>
            <Badge status="neutral">{remixModeLabel(batch.mode)}</Badge>
            {items.length > 1 ? (
              <span className={outputStyles.outputNav}>
                {previous ? (
                  <RouterLink className={annotationStyles.secondaryLink} to={buildRemixOutputPath(batch.batchId, previous.ordinal, list)} aria-label="上一条">
                    <ChevronLeft size={14} strokeWidth={1.8} aria-hidden /> 上一条
                  </RouterLink>
                ) : null}
                {next ? (
                  <RouterLink className={annotationStyles.secondaryLink} to={buildRemixOutputPath(batch.batchId, next.ordinal, list)} aria-label="下一条" aria-keyshortcuts="N">
                    下一条 <ChevronRight size={14} strokeWidth={1.8} aria-hidden />
                  </RouterLink>
                ) : null}
              </span>
            ) : null}
            <RefreshButton onRefresh={onRefresh} loading={refreshing} />
          </span>
        </div>
        <div className={annotationStyles.workspace}>
          <OutputPlayer
            key={item.runId}
            item={item}
            videoRef={videoRef}
            onTime={setCurrentMs}
            onDuration={setVideoMs}
          />
          <div className={annotationStyles.workColumn}>
            <div className={outputStyles.reviewHead}>
              <RemixItemStatus item={item} />
              <span className={outputStyles.reviewMeta}>{meta}</span>
            </div>
            <RemixQcSummary qc={item.qc} />
            <RemixDeliveryStatus
              delivery={item.delivery}
              onRetry={onRetryDelivery}
              retrying={deliveryRetrying}
              retryError={deliveryError}
            />
            <RemixPictureReview item={item} onPlay={seek} />
            <section className={remixStyles.stack} aria-labelledby="remix-output-timeline-title">
              <div className={annotationStyles.cardHeading}>
                <h3 id="remix-output-timeline-title">成片时间轴</h3>
                <span className={annotationStyles.fieldHelp}>点击色块从该段播放；点击刻度从该时间播放。</span>
              </div>
              <RemixOutputTimeline item={item} preset={preset} durationMs={durationMs} currentMs={currentMs} onSeek={playable ? seek : undefined} />
            </section>
            <section className={remixStyles.stack} aria-labelledby="remix-output-sources-title">
              <h3 id="remix-output-sources-title">片段来源</h3>
              <Lineage item={item} preset={preset} presets={presets} />
            </section>
            <section className={remixStyles.stack} aria-labelledby="remix-output-review-title">
              <h3 id="remix-output-review-title">人工审核</h3>
              <ReviewPanel
                key={item.runId}
                item={item}
                onReview={onReview}
                reviewing={reviewing}
                reviewError={reviewError}
                onNext={next ? () => navigate(buildRemixOutputPath(batch.batchId, next.ordinal, list)) : undefined}
              />
              {nextPending && remixItemReviewState(item) !== 'pending' ? (
                <RouterLink className={annotationStyles.tableLink} to={buildRemixOutputPath(batch.batchId, nextPending.ordinal, list)}>
                  下一条{REMIX_REVIEW_LABELS.pending}：第 {nextPending.ordinal} 条 →
                </RouterLink>
              ) : null}
            </section>
          </div>
        </div>
      </article>
    </div>
  );
}
