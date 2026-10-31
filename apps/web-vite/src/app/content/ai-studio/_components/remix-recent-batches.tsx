import { Alert, Button, SkeletonText } from '@lobehub/ui';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import {
  isRemixBatchWithoutOutputs,
  type RemixBatchMode,
  remixBatchDeletedCount,
  remixBatchOwnerLabel,
  remixBatchReviewState,
  remixBatchReviewSummary,
  type StudioRemixBatch,
} from '../_lib/remix-api';
import { remixBatchStructureText } from '../_lib/remix-form';
import { buildRemixBatchPath, buildRemixOutputPath } from '../_lib/remix-routes';
import { formatShortTimestamp } from '../_lib/studio-time';
import { RemixBatchStatus } from './remix-status';
import { useRemixBatches } from './use-remix-batches';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import workbenchStyles from './studio-workbench.module.css';
import { RefreshButton } from './refresh-button';

const RECENT_LIMIT = 8;

function progressText(batch: StudioRemixBatch): string {
  const parts = [...remixBatchReviewSummary(batch), `完成 ${batch.succeededCount} / ${batch.plannedCount} 条`];
  if (batch.runningCount > 0) parts.push(`渲染中 ${batch.runningCount}`);
  if (batch.failedCount > 0) parts.push(`失败 ${batch.failedCount}`);
  if (batch.cancelledCount > 0) parts.push(`已取消 ${batch.cancelledCount}`);
  if (remixBatchDeletedCount(batch) > 0) parts.push(`已删除 ${remixBatchDeletedCount(batch)} 条`);
  return parts.join(' · ');
}

const COPY = {
  framework: { title: '最近批次', none: '还没有框架混剪批次，生成后会显示在这里。', empty: '还没有出成片的批次。' },
  sellingPoint: { title: '最近批次', none: '还没有卖点混剪批次，生成后会显示在这里。', empty: '还没有出成片的批次。' },
  edit: { title: '最近单条成片', none: '还没有单条成片，生成后会显示在这里。', empty: '还没有出片成功的单条成片。' },
} as const;

/**
 * Newest batches of one mode beside the form, so a submitted batch's progress
 * stays in view; the full list and outputs live on 成片.
 * `openAccess`: every signed-in user sees every batch, so others' are named.
 */
export function RemixRecentBatches({
  presets,
  openAccess,
  mode,
}: {
  presets: readonly StudioSegmentPreset[];
  openAccess: boolean;
  mode: RemixBatchMode;
}) {
  const { query, refresh, pollPaused } = useRemixBatches(true);
  const copy = COPY[mode];
  const all = (query.data ?? []).filter((batch) => batch.mode === mode);
  // Same rule as 成片: batches with no output left to watch stay out of the way.
  const batches = all.filter((batch) => !isRemixBatchWithoutOutputs(batch));
  const hidden = all.length - batches.length;

  return (
    <article className={`${pageStyles.card} ${workbenchStyles.runsCard}`} aria-labelledby="remix-recent-title">
      <div className={styles.cardHeading}>
        <h2 id="remix-recent-title">{copy.title}</h2>
        <RefreshButton onRefresh={() => void refresh()} loading={query.isFetching} />
      </div>
      {query.isError ? (
        <Alert
          type="error"
          showIcon
          title="批次读取失败"
          description={query.error instanceof Error ? query.error.message : '请求失败，请稍后重试。'}
          action={<Button size="small" onClick={() => void refresh()}>重试</Button>}
        />
      ) : query.isPending ? (
        <SkeletonText rows={3} />
      ) : batches.length === 0 ? (
        <p className={styles.fieldHelp}>{all.length === 0 ? copy.none : copy.empty}</p>
      ) : (
        <ul className={workbenchStyles.runRows} aria-label={copy.title}>
          {batches.slice(0, RECENT_LIMIT).map((batch) => {
            const structure = remixBatchStructureText(batch, presets);
            return (
              <li key={batch.batchId} className={workbenchStyles.runRow}>
                <span className={workbenchStyles.runTitle} title={batch.productName}>{batch.productName}</span>
                <span className={workbenchStyles.runDetail} title={structure}>{structure}</span>
                <span className={workbenchStyles.runTime}>
                  {progressText(batch)} · {formatShortTimestamp(batch.createdAt)}
                  {openAccess && !batch.ownedByCurrentUser ? ` · ${remixBatchOwnerLabel(batch)}` : ''}
                </span>
                <span className={workbenchStyles.runStatus}>
                  <RemixBatchStatus batch={batch} />
                </span>
                <span className={workbenchStyles.runAction}>
                  <RouterLink
                    className={styles.tableLink}
                    to={batch.plannedCount === 1 ? buildRemixOutputPath(batch.batchId, 1) : buildRemixBatchPath(batch.batchId)}
                  >
                    {remixBatchReviewState(batch) === 'pending' ? '去审核' : '查看成片'}
                  </RouterLink>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.fieldHelp} role="status" aria-live="polite">
        {pollPaused ? '自动刷新已暂停（超过 30 分钟），点「刷新」查看最新进度。' : ''}
      </p>
      {batches.length > RECENT_LIMIT || hidden > 0 ? (
        <RouterLink className={styles.tableLink} to={ROUTE_PATHS.contentAiStudioOutputs}>
          {hidden > 0 ? `全部批次（另有 ${hidden} 个没有成片）` : `全部批次（${batches.length}）`}
        </RouterLink>
      ) : null}
    </article>
  );
}
