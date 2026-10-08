import { ArrowLeftOutlined, ExportOutlined, PlayCircleFilled } from '@ant-design/icons';
import { Alert, Button, Popconfirm, Skeleton } from 'antd';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import {
  hasCancellableRemixItems,
  remixBatchOwnerLabel,
  remixBatchStatusView,
  remixItemStatusView,
  type StudioRemixBatchDetail,
  type StudioRemixBatchItem,
} from '../_lib/remix-api';
import { shortAssetTitle } from '../_lib/remix-form';
import { buildContentAssetDetailPath, buildEditFromOutputPath, buildEditingRunPath } from '../_lib/remix-routes';
import { findPreset, labelName } from '../_lib/segment-display';
import { buildSegmentAnnotationPath } from '../_lib/segment-routes';
import { formatSegmentDuration, formatSegmentTime } from '../_lib/segment-time';
import { formatShortTimestamp } from '../_lib/studio-time';
import { RemixOutputPlayer } from './remix-output-player';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import outputStyles from './remix-outputs.module.css';
import remixStyles from './remix.module.css';

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
  const view = remixItemStatusView(item);
  return (
    <span className={remixStyles.stack}>
      <Badge status={view.tone}>{view.label}</Badge>
      {item.outcome === 'failed' && item.jobError ? <span className={styles.fieldError}>{item.jobError}</span> : null}
    </span>
  );
}

function Lineage({ item, preset }: { item: StudioRemixBatchItem; preset: StudioSegmentPreset | undefined }) {
  return (
    <ol className={outputStyles.lineage} aria-label={`第 ${item.ordinal} 条的片段组成`}>
      {item.segments.map((segment) => (
        <li key={segment.segmentId}>
          <strong>{labelName(preset, segment.labelKey)}</strong>
          <RouterLink
            className={`${styles.tableLink} ${outputStyles.lineageSource}`}
            to={buildSegmentAnnotationPath(segment.assetId, segment.segmentId)}
            title={segment.assetTitle}
          >
            {shortAssetTitle(segment.assetTitle || '原片')}
          </RouterLink>
          <span className={outputStyles.lineageWhen}>
            <span className={outputStyles.lineageTime}>
              {formatSegmentTime(segment.startMs)}–{formatSegmentTime(segment.endMs)}
            </span>
            <RouterLink
              className={styles.tableLink}
              to={buildContentAssetDetailPath(segment.assetId)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`在素材库查看原片 ${segment.assetTitle || segment.assetId}`}
              title="新标签页打开素材库原片"
            >
              <ExportOutlined aria-hidden />
            </RouterLink>
          </span>
        </li>
      ))}
    </ol>
  );
}

interface OutputCardProps {
  batchId: string;
  item: StudioRemixBatchItem;
  preset: StudioSegmentPreset | undefined;
  /** Runs task pages are owner-only; another user's Runs would open as not found. */
  showRunLinks: boolean;
  onPlay: () => void;
}

function OutputCard({ batchId, item, preset, showRunLinks, onPlay }: OutputCardProps) {
  const view = remixItemStatusView(item);
  const playable = Boolean(item.outputAssetId);
  return (
    <article className={outputStyles.output} aria-label={`第 ${item.ordinal} 条成片`}>
      <button
        type="button"
        className={outputStyles.outputCover}
        disabled={!playable}
        onClick={onPlay}
        aria-label={playable ? `播放第 ${item.ordinal} 条成片` : `第 ${item.ordinal} 条：${view.label}`}
      >
        {item.outputCoverUrl ? <img src={item.outputCoverUrl} alt="" loading="lazy" /> : playable ? null : <span>{view.label}</span>}
        {playable ? <PlayCircleFilled className={outputStyles.play} aria-hidden /> : null}
        <span className={outputStyles.duration}>{formatSegmentDuration(0, item.durationMs)}</span>
      </button>
      <div className={outputStyles.head}>
        <strong>第 {item.ordinal} 条</strong>
        <ItemStatus item={item} />
      </div>
      <Lineage item={item} preset={preset} />
      <div className={outputStyles.actions}>
        {playable ? (
          <>
            <Button size="small" onClick={onPlay}>
              播放 / 下载
            </Button>
            <RouterLink className={styles.tableLink} to={buildEditFromOutputPath(batchId, item.ordinal)} title="在单条剪辑里载入这条成片的片段和入出点">
              以此为起点编辑
            </RouterLink>
            <RouterLink
              className={styles.tableLink}
              to={buildContentAssetDetailPath(item.outputAssetId!)}
              target="_blank"
              rel="noopener noreferrer"
              title="新标签页打开素材库中的这条成片"
            >
              在素材库查看
            </RouterLink>
          </>
        ) : item.outcome === 'succeeded' ? (
          <span className={styles.readOnlyHint}>
            {showRunLinks ? '未关联素材库资产，可在任务详情查看成片' : '未关联素材库资产，需发起人在任务详情查看'}
          </span>
        ) : null}
        {showRunLinks ? (
          <RouterLink className={styles.tableLink} to={buildEditingRunPath(item.runId)}>
            任务详情
          </RouterLink>
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
  const [playing, setPlaying] = useState<StudioRemixBatchItem | null>(null);
  const back = (
    <RouterLink className={styles.backLink} to={ROUTE_PATHS.contentAiStudioOutputs}>
      <ArrowLeftOutlined aria-hidden /> 全部批次
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
  if (!detail) return loading ? <Skeleton active paragraph={{ rows: 6 }} /> : null;
  const { batch, items } = detail;
  const preset = findPreset(presets, batch.presetKey, batch.presetVersion);
  const status = remixBatchStatusView(batch.status);
  const cancellable = hasCancellableRemixItems(items);
  // Runs task pages are owner-only; another user's Runs would open as not found.
  const showRunLinks = batch.ownedByCurrentUser;
  const summary = [
    `完成 ${batch.succeededCount} / ${batch.plannedCount} 条`,
    batch.runningCount > 0 ? `渲染中 ${batch.runningCount}` : null,
    batch.failedCount > 0 ? `失败 ${batch.failedCount}` : null,
    batch.cancelledCount > 0 ? `已取消 ${batch.cancelledCount}` : null,
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
            {batch.mode === 'edit' ? <Badge status="neutral">单条剪辑</Badge> : null}
            <Badge status={status.tone}>{status.label}</Badge>
            {cancellable ? (
              <Popconfirm
                title="取消这个批次里未完成的成片？"
                description="排队中的条目会直接取消；已在渲染的条目需要等渲染进程停止，可能无法立即结束。已完成的成片不受影响，取消后不会自动重试。"
                okText="取消未完成"
                cancelText="返回"
                okButtonProps={{ danger: true }}
                onConfirm={onCancel}
              >
                <Button danger loading={cancelling}>
                  取消未完成
                </Button>
              </Popconfirm>
            ) : null}
            <Button onClick={onRefresh} loading={refreshing}>
              刷新
            </Button>
          </span>
        </div>
        <p className={outputStyles.summary}>{summary}</p>
        {batch.shortfallReason ? <Alert type="warning" showIcon title={`只生成了 ${batch.plannedCount} 条：${batch.shortfallReason}`} /> : null}
        {cancelError ? <Alert type="error" showIcon title="取消未完成成片失败" description={cancelError} /> : null}
        <ul className={`${outputStyles.grid} ${outputStyles.outputGrid}`} aria-label="成片">
          {items.map((item) => (
            <li key={item.runId}>
              <OutputCard batchId={batch.batchId} item={item} preset={preset} showRunLinks={showRunLinks} onPlay={() => setPlaying(item)} />
            </li>
          ))}
        </ul>
        <p className={styles.fieldHelp}>
          成功的成片已回存素材库（来源为 AI 创作中心）。
          {showRunLinks ? '失败的条目可在任务详情中查看原因并恢复渲染。' : '任务详情只对发起人开放，失败条目需由发起人查看原因并恢复渲染。'}
          进行中时每 10 秒自动刷新。
        </p>
        <p className={styles.fieldHelp} role="status" aria-live="polite">
          {pollPaused ? '已持续刷新 30 分钟仍在出片，自动刷新已暂停，点「刷新」继续查看进度。' : ''}
        </p>
      </article>
      <RemixOutputPlayer
        assetId={playing?.outputAssetId ?? null}
        title={playing ? `第 ${playing.ordinal} 条成片` : ''}
        onClose={() => setPlaying(null)}
      />
    </div>
  );
}
