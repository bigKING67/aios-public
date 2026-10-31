import { Alert, Button, confirmModal, DropdownMenu, SkeletonText, type DropdownItem } from '@lobehub/ui';
import { ArrowLeft, CirclePlay, Ellipsis } from 'lucide-react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import { AiTaskStatus } from '@/components/molecules/ai-task-status';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import {
  hasCancellableRemixItems,
  isRemixBatchActive,
  remixBatchOwnerLabel,
  remixBatchProgress,
  remixBatchDeletedCount,
  remixBatchReviewState,
  remixBatchReviewSummary,
  remixBatchView,
  remixItemReviewState,
  remixItemStatusView,
  remixModeLabel,
  remixTierLabel,
  remixWaitingReasonLabel,
  type StudioRemixBatchDetail,
  type StudioRemixBatchItem,
} from '../_lib/remix-api';
import { shortAssetTitle } from '../_lib/remix-form';
import {
  filterRemixItemsByReviewArchive,
  isRejectedRemixItem,
  isRemixItemPlaybackAvailable,
  remixRetentionText,
} from '../_lib/remix-review';
import {
  buildEditFromOutputPath,
  buildEditingRunPath,
  buildOutputsListPath,
  buildRemixOutputPath,
  OUTPUTS_REJECTED,
  OUTPUTS_REVIEW_PARAM,
  outputsListParams,
} from '../_lib/remix-routes';
import { findPreset, labelName, SELLING_POINT_PRESET_KEY, sellingPointNames } from '../_lib/segment-display';
import { buildSegmentAnnotationPath } from '../_lib/segment-routes';
import { formatSegmentDuration, formatSegmentTime } from '../_lib/segment-time';
import { formatShortTimestamp } from '../_lib/studio-time';
import { frozenAdmissionSummary } from '../_lib/source-spend';
import { RemixItemStatus, ReviewStatus } from './remix-status';
import { RemixQcSummary } from './remix-qc-summary';
import { RemixDeliveryStatus } from './remix-delivery';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import outputStyles from './remix-outputs.module.css';
import remixStyles from './remix.module.css';
import { RefreshButton } from './refresh-button';

interface RemixBatchDetailViewProps {
  detail: StudioRemixBatchDetail | undefined;
  presets: readonly StudioSegmentPreset[];
  /** Open studio access: batches of other users are visible and cancellable. */
  openAccess: boolean;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  cancelling: boolean;
  cancelError: string | null;
  onCancel: () => void;
  /** Auto refresh ran out while outputs are still rendering. */
  pollPaused?: boolean;
}

function ItemStatus({ item }: { item: StudioRemixBatchItem }) {
  return (
    <span className={remixStyles.stack}>
      <RemixItemStatus item={item} />
      {item.outcome === 'failed' && item.jobError ? <span className={styles.fieldError}>{item.jobError}</span> : null}
    </span>
  );
}

/** Where each segment of an output came from: label, source original (opens its annotation) and interval. */
export function Lineage({
  item,
  preset,
  presets,
}: {
  item: StudioRemixBatchItem;
  preset: StudioSegmentPreset | undefined;
  presets: readonly StudioSegmentPreset[];
}) {
  return (
    <ol className={outputStyles.lineage} aria-label={`第 ${item.ordinal} 条的片段组成`}>
      {item.segments.map((segment) => (
        <li key={segment.segmentId}>
          <strong>{labelName(preset, segment.labelKey)}</strong>
          <RouterLink
            className={`${styles.tableLink} ${outputStyles.lineageSource}`}
            // A 卖点混剪 block (not 整段替换) starts at a selling-point segment.
            to={buildSegmentAnnotationPath(segment.assetId, segment.segmentId, segment.tier && !segment.fallback ? SELLING_POINT_PRESET_KEY : undefined)}
            title={segment.assetTitle}
          >
            {shortAssetTitle(segment.assetTitle || '原片')}
          </RouterLink>
          <span className={outputStyles.lineageTime}>
            {formatSegmentTime(segment.startMs)}–{formatSegmentTime(segment.endMs)}
          </span>
          {remixTierLabel(segment.tier, segment.fallback) ? (
            <span className={outputStyles.lineagePlan}>
              {[
                segment.sellingPoints?.length ? sellingPointNames(presets, segment.sellingPoints).join(' + ') : null,
                remixTierLabel(segment.tier, segment.fallback),
              ].filter(Boolean).join(' · ')}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

interface OutputCardProps {
  batchId: string;
  item: StudioRemixBatchItem;
  preset: StudioSegmentPreset | undefined;
  presets: readonly StudioSegmentPreset[];
  /** 卖点混剪 outputs are made of selling-point segments that single editing cannot load. */
  editable: boolean;
  /** Runs task pages are owner-only; another user's Runs would open as not found. */
  showRunLinks: boolean;
  /** The output's review page. */
  reviewPath: string;
}

/**
 * One primary action per card — 去审核 while the output waits for a person, 查看 once reviewed, both
 * opening the review page (player, timeline, review); the rest — single editing from this output and the owner's
 * task page — sit behind ⋯ so the card keeps one control style.
 */
function OutputCard({ batchId, item, preset, presets, editable, showRunLinks, reviewPath }: OutputCardProps) {
  const navigate = useNavigate();
  const view = remixItemStatusView(item);
  const playable = isRemixItemPlaybackAvailable(item);
  const rejected = isRejectedRemixItem(item);
  const pending = remixItemReviewState(item) === 'pending';
  const coverText = rejected ? '已驳回' : item.outputDeleted ? '成片已删除' : view.label;
  const admission = frozenAdmissionSummary(item.segments);
  const retentionText = remixRetentionText(item);
  const more: DropdownItem[] = [];
  // The lineage still loads in single editing even after the output itself was deleted.
  if (editable) {
    more.push({ key: 'edit', label: '以此为起点编辑', onClick: () => navigate(buildEditFromOutputPath(batchId, item.ordinal)) });
  }
  if (showRunLinks) {
    more.push({ key: 'run', label: '任务详情', onClick: () => navigate(buildEditingRunPath(item.runId)) });
  }
  return (
    <article className={outputStyles.output} aria-label={`第 ${item.ordinal} 条成片`}>
      {playable ? (
        <RouterLink className={outputStyles.outputCover} to={reviewPath} aria-label={`打开第 ${item.ordinal} 条成片`}>
          {item.outputCoverUrl ? <img src={item.outputCoverUrl} alt="" loading="lazy" /> : null}
          <CirclePlay className={outputStyles.play} size={40} strokeWidth={1.4} aria-hidden="true" />
          <span className={outputStyles.duration}>{formatSegmentDuration(0, item.durationMs)}</span>
        </RouterLink>
      ) : (
        <span className={outputStyles.outputCover} aria-label={`第 ${item.ordinal} 条：${coverText}`}>
          {item.outputCoverUrl ? <img src={item.outputCoverUrl} alt="" loading="lazy" /> : <span>{coverText}</span>}
          <span className={outputStyles.duration}>{formatSegmentDuration(0, item.durationMs)}</span>
        </span>
      )}
      <div className={outputStyles.head}>
        <strong>第 {item.ordinal} 条</strong>
        <ItemStatus item={item} />
      </div>
      {admission ? <p className={outputStyles.admissionSummary}>{admission.label}</p> : null}
      <RemixQcSummary qc={item.qc} compact />
      <RemixDeliveryStatus delivery={item.delivery} compact />
      <Lineage item={item} preset={preset} presets={presets} />
      <div className={outputStyles.actions}>
        {rejected ? (
          <>
            <RouterLink className={styles.tableLink} to={reviewPath}>
              查看驳回记录
            </RouterLink>
            {retentionText ? <span className={styles.readOnlyHint}>{retentionText}</span> : null}
          </>
        ) : playable ? (
          <RouterLink className={pending ? styles.secondaryLink : styles.tableLink} to={reviewPath}>
            {pending ? '去审核' : '查看'}
          </RouterLink>
        ) : item.qc ? (
          <>
            <RouterLink className={styles.tableLink} to={reviewPath}>
              查看质检报告
            </RouterLink>
            {item.outputDeleted ? <span className={styles.readOnlyHint}>这条成片已删除，无法再播放或下载</span> : null}
          </>
        ) : item.outputDeleted ? (
          <span className={styles.readOnlyHint}>这条成片已删除，无法再播放或下载</span>
        ) : item.outcome === 'succeeded' ? (
          <span className={styles.readOnlyHint}>
            {showRunLinks ? '没有可播放的成片文件，可在任务详情查看成片' : '没有可播放的成片文件，需发起人在任务详情查看'}
          </span>
        ) : (
          <span />
        )}
        {more.length > 0 ? (
          <DropdownMenu items={more} placement="bottomRight">
            <Button
              type="text"
              size="small"
              icon={<Ellipsis size={16} strokeWidth={1.8} aria-hidden="true" />}
              aria-label={`第 ${item.ordinal} 条的更多操作`}
            />
          </DropdownMenu>
        ) : null}
      </div>
    </article>
  );
}

export function RemixBatchDetailView({
  detail,
  presets,
  openAccess,
  loading,
  error,
  refreshing,
  onRefresh,
  cancelling,
  cancelError,
  onCancel,
  pollPaused = false,
}: RemixBatchDetailViewProps) {
  const [params] = useSearchParams();
  const list = outputsListParams(params);
  const rejectedArchive = params.get(OUTPUTS_REVIEW_PARAM) === OUTPUTS_REJECTED;
  const back = (
    <RouterLink className={styles.backLink} to={buildOutputsListPath(list)}>
      <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> 全部批次
    </RouterLink>
  );
  if (error) {
    return (
      <div className={remixStyles.stack}>
        {back}
        <Alert type="error" showIcon title="批次读取失败" description={error} action={<Button onClick={onRefresh}>重试</Button>} />
      </div>
    );
  }
  if (!detail) return loading ? <SkeletonText rows={6} /> : null;
  const { batch, items } = detail;
  const visibleItems = filterRemixItemsByReviewArchive(items, rejectedArchive);
  const preset = findPreset(presets, batch.presetKey, batch.presetVersion);
  const status = remixBatchView(batch);
  const review = remixBatchReviewState(batch);
  const failure = batch.failedCount > 0 ? remixWaitingReasonLabel(batch.failureReason) : null;
  const cancellable = hasCancellableRemixItems(items);
  // Runs task pages are owner-only; another user's Runs would open as not found.
  const showRunLinks = batch.ownedByCurrentUser;
  const summary = [
    `完成 ${batch.succeededCount} / ${batch.plannedCount} 条`,
    batch.runningCount > 0 ? `渲染中 ${batch.runningCount}` : null,
    batch.failedCount > 0 ? `失败 ${batch.failedCount}` : null,
    batch.cancelledCount > 0 ? `已取消 ${batch.cancelledCount}` : null,
    remixBatchDeletedCount(batch) > 0 ? `已删除 ${remixBatchDeletedCount(batch)} 条` : null,
    batch.plannedCount < batch.requestedCount ? `请求 ${batch.requestedCount} 条` : null,
    openAccess ? `发起人：${remixBatchOwnerLabel(batch)}` : null,
    formatShortTimestamp(batch.createdAt),
  ].filter(Boolean).join(' · ');

  return (
    <div className={remixStyles.stack}>
      {back}
      <article className={pageStyles.card} aria-labelledby="remix-batch-title">
        <div className={styles.cardHeading}>
          <h2 id="remix-batch-title">
            {batch.productName} · {batch.labels.map((key) => labelName(preset, key)).join(' → ')}
          </h2>
          <span className={styles.rowActions}>
            <Badge status="neutral">{remixModeLabel(batch.mode)}</Badge>
            {cancellable ? (
              <Button
                danger
                loading={cancelling}
                onClick={() =>
                  confirmModal({
                    title: '取消这个批次里未完成的成片？',
                    content:
                      '排队中的条目会直接取消；已在渲染的条目需要等渲染进程停止，可能无法立即结束。已完成的成片不受影响，取消后不会自动重试。',
                    okText: '取消未完成',
                    cancelText: '返回',
                    okButtonProps: { danger: true },
                    onOk: onCancel,
                  })
                }
              >
                取消未完成
              </Button>
            ) : null}
            <RefreshButton onRefresh={onRefresh} loading={refreshing} />
          </span>
        </div>
        {review ? (
          <div className={outputStyles.reviewHead}>
            <ReviewStatus state={review} />
            <span className={outputStyles.reviewMeta}>{[...remixBatchReviewSummary(batch), summary].join(' · ')}</span>
            {failure ? <span className={outputStyles.reviewMeta}>失败原因：{failure}</span> : null}
          </div>
        ) : (
          <AiTaskStatus
            framed={false}
            state={status.state}
            stateLabel={status.label}
            label={summary}
            progress={isRemixBatchActive(batch) ? remixBatchProgress(batch) : undefined}
            detail={failure ? `失败原因：${failure}` : undefined}
          />
        )}
        {batch.shortfallReason ? <Alert type="warning" showIcon title={`只生成了 ${batch.plannedCount} 条：${batch.shortfallReason}`} /> : null}
        {cancelError ? <Alert type="error" showIcon title="取消未完成成片失败" description={cancelError} /> : null}
        {visibleItems.length > 0 ? (
          <ul className={`${outputStyles.grid} ${batch.mode === 'sellingPoint' ? '' : outputStyles.outputGrid}`} aria-label={rejectedArchive ? '已驳回成片' : '成片'}>
          {visibleItems.map((item) => (
            <li key={item.runId}>
              <OutputCard
                batchId={batch.batchId}
                item={item}
                preset={preset}
                presets={presets}
                editable={batch.mode !== 'sellingPoint'}
                showRunLinks={showRunLinks}
                reviewPath={buildRemixOutputPath(batch.batchId, item.ordinal, list)}
              />
            </li>
          ))}
          </ul>
        ) : (
          <p className={styles.fieldHelp}>
            {rejectedArchive ? '这个批次没有已驳回记录。' : '这个批次的成片均已驳回，请从「已驳回」入口查看记录。'}
          </p>
        )}
        <p className={styles.fieldHelp}>
          {rejectedArchive ? '已驳回记录会保留审核原因与来源；仅在 7 天撤回期内可以恢复为待审核。' : '成功的成片需逐条打开审核，人工通过后才算可用。'}
          {!rejectedArchive && (showRunLinks ? '失败的条目可在任务详情中查看原因并恢复渲染。' : '任务详情只对发起人开放，失败条目需由发起人查看原因并恢复渲染。')}
          进行中时每 10 秒自动刷新。
        </p>
        <p className={styles.fieldHelp} role="status" aria-live="polite">
          {pollPaused ? '已持续刷新 30 分钟仍在出片，自动刷新已暂停，点「刷新」继续查看进度。' : ''}
        </p>
      </article>
    </div>
  );
}
