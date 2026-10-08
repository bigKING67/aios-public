import { Alert, Button, Skeleton } from 'antd';
import { Link as RouterLink } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioSegmentPreset } from '../_lib/ai-studio-api';
import { remixBatchOwnerLabel, remixBatchStatusView, type StudioRemixBatch } from '../_lib/remix-api';
import { remixBatchStructureText } from '../_lib/remix-form';
import { buildRemixBatchPath } from '../_lib/remix-routes';
import { formatShortTimestamp } from '../_lib/studio-time';
import { useRemixBatches } from './use-remix-batches';
import pageStyles from '../ai-studio.module.css';
import styles from './segment-annotation.module.css';
import remixStyles from './remix.module.css';
import workbenchStyles from './studio-workbench.module.css';

const RECENT_LIMIT = 8;

function progressText(batch: StudioRemixBatch): string {
  const parts = [`完成 ${batch.succeededCount} / ${batch.plannedCount} 条`];
  if (batch.runningCount > 0) parts.push(`渲染中 ${batch.runningCount}`);
  if (batch.failedCount > 0) parts.push(`失败 ${batch.failedCount}`);
  if (batch.cancelledCount > 0) parts.push(`已取消 ${batch.cancelledCount}`);
  return parts.join(' · ');
}

const COPY = {
  framework: { title: '最近批次', none: '还没有框架混剪批次，生成后会显示在这里。', empty: '还没有出成片的批次。' },
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
  mode: 'framework' | 'edit';
}) {
  const { query, refresh, pollPaused } = useRemixBatches(true);
  const copy = COPY[mode];
  const all = (query.data ?? []).filter((batch) => (batch.mode === 'edit') === (mode === 'edit'));
  // Same rule as 成片: batches that ended without any output stay out of the way.
  const batches = all.filter((batch) => batch.succeededCount > 0 || batch.runningCount > 0);
  const hidden = all.length - batches.length;

  return (
    <article className={`${pageStyles.card} ${workbenchStyles.recentCard}`} aria-labelledby="remix-recent-title">
      <div className={styles.cardHeading}>
        <h2 id="remix-recent-title">{copy.title}</h2>
        <Button size="small" onClick={() => void refresh()} loading={query.isFetching}>
          刷新
        </Button>
      </div>
      <div className={workbenchStyles.recentBody}>
        {query.isError ? (
          <Alert
            type="error"
            showIcon
            title="批次读取失败"
            description={query.error instanceof Error ? query.error.message : '请求失败，请稍后重试。'}
            action={<Button size="small" onClick={() => void refresh()}>重试</Button>}
          />
        ) : query.isPending ? (
          <Skeleton active paragraph={{ rows: 3 }} title={false} />
        ) : batches.length === 0 ? (
          <p className={styles.fieldHelp}>{all.length === 0 ? copy.none : copy.empty}</p>
        ) : (
          <ul className={workbenchStyles.recentList} aria-label={copy.title}>
            {batches.slice(0, RECENT_LIMIT).map((batch) => {
              const view = remixBatchStatusView(batch.status);
              const structure = remixBatchStructureText(batch, presets);
              return (
                <li key={batch.batchId}>
                  <div className={workbenchStyles.recentHead}>
                    <span className={workbenchStyles.recentTitle} title={batch.productName}>{batch.productName}</span>
                    <Badge status={view.tone}>{view.label}</Badge>
                  </div>
                  <span className={remixStyles.recentStructure} title={structure}>{structure}</span>
                  <div className={workbenchStyles.recentFoot}>
                    <span>
                      {progressText(batch)} · {formatShortTimestamp(batch.createdAt)}
                      {openAccess && !batch.ownedByCurrentUser ? ` · ${remixBatchOwnerLabel(batch)}` : ''}
                    </span>
                    <RouterLink className={styles.tableLink} to={buildRemixBatchPath(batch.batchId)}>
                      查看成片
                    </RouterLink>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
