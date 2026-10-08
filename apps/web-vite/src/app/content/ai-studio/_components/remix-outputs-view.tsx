import { VideoCameraOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton } from 'antd';
import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import type { StudioCapabilitiesResponse, StudioSegmentPreset } from '../_lib/ai-studio-api';
import { remixBatchOwnerLabel, remixBatchStatusView, remixWaitingReasonLabel, type StudioRemixBatch } from '../_lib/remix-api';
import { remixBatchStructureText } from '../_lib/remix-form';
import { buildEditingModePath, buildRemixBatchPath, REMIX_BATCH_PARAM } from '../_lib/remix-routes';
import { formatShortTimestamp } from '../_lib/studio-time';
import { RemixBatchDetailView } from './remix-batch-detail';
import { useStudioPresets } from './use-ai-studio-queries';
import { useCancelRemixBatch, useRemixBatch, useRemixBatches } from './use-remix-batches';
import pageStyles from '../ai-studio.module.css';
import outputStyles from './remix-outputs.module.css';
import styles from './segment-annotation.module.css';

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

const COVER_SLOTS = 4;

function BatchCard({ batch, presets, openAccess }: { batch: StudioRemixBatch; presets: readonly StudioSegmentPreset[]; openAccess: boolean }) {
  const view = remixBatchStatusView(batch.status);
  const structure = remixBatchStructureText(batch, presets);
  const failure = batch.failedCount > 0 ? remixWaitingReasonLabel(batch.failureReason) : null;
  const slots = Math.min(COVER_SLOTS, Math.max(batch.plannedCount, 1));
  return (
    <RouterLink className={outputStyles.batchCard} to={buildRemixBatchPath(batch.batchId)} aria-label={`${batch.productName} · ${structure}`}>
      <span className={outputStyles.covers} aria-hidden>
        {Array.from({ length: slots }, (_, index) => (
          <span key={index} className={outputStyles.cover}>
            {batch.coverUrls[index] ? <img src={batch.coverUrls[index]} alt="" loading="lazy" /> : <VideoCameraOutlined />}
          </span>
        ))}
      </span>
      <span className={outputStyles.head}>
        <span className={outputStyles.title} title={batch.productName}>{batch.productName}</span>
        {batch.mode === 'edit' ? <Badge status="neutral">单条</Badge> : null}
        <Badge status={view.tone}>{view.label}</Badge>
      </span>
      <span className={outputStyles.structure} title={structure}>{structure}</span>
      <span className={outputStyles.meta}>
        <span>完成 {batch.succeededCount} / {batch.plannedCount} 条</span>
        {batch.runningCount > 0 ? <span>渲染中 {batch.runningCount}</span> : null}
        {batch.failedCount > 0 ? <span>失败 {batch.failedCount}</span> : null}
        {batch.cancelledCount > 0 ? <span>已取消 {batch.cancelledCount}</span> : null}
        {batch.plannedCount < batch.requestedCount ? <span>请求 {batch.requestedCount} 条</span> : null}
        <span>{formatShortTimestamp(batch.createdAt)}</span>
        {openAccess ? <span>{remixBatchOwnerLabel(batch)}</span> : null}
      </span>
      {failure ? <span className={outputStyles.failure}>失败原因：{failure}</span> : null}
    </RouterLink>
  );
}

/** `openAccess`: every signed-in user sees every batch, so the creator is shown. */
function BatchList({ presets, openAccess }: { presets: readonly StudioSegmentPreset[]; openAccess: boolean }) {
  const { query, refresh, pollPaused } = useRemixBatches(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const all = query.data ?? [];
  // Batches that ended without any output (failed or cancelled) are noise on 成片; they stay one click away.
  const empty = all.filter((batch) => batch.succeededCount === 0 && batch.runningCount === 0);
  const batches = showEmpty ? all : all.filter((batch) => !empty.includes(batch));
  return (
    <article className={pageStyles.card} aria-labelledby="remix-batches-title">
      <div className={styles.cardHeading}>
        <h2 id="remix-batches-title">{openAccess ? '全部成片批次' : '我的成片批次'}</h2>
        <span className={styles.rowActions}>
          <RouterLink className={styles.secondaryLink} to={buildEditingModePath(true)}>
            新建批次
          </RouterLink>
          <Button onClick={() => void refresh()} loading={query.isFetching}>
            刷新
          </Button>
        </span>
      </div>
      {query.isError ? (
        <Alert type="error" showIcon title="批次读取失败" description={errorText(query.error)} action={<Button onClick={() => void refresh()}>重试</Button>} />
      ) : query.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : all.length === 0 ? (
        <p className={styles.fieldHelp}>{openAccess ? '还没有人生成过成片。' : '你还没有生成过成片。'}</p>
      ) : batches.length === 0 ? (
        <p className={styles.fieldHelp}>还没有出成片的批次。</p>
      ) : (
        <ul className={outputStyles.grid} aria-label="成片批次">
          {batches.map((batch) => (
            <li key={batch.batchId}>
              <BatchCard batch={batch} presets={presets} openAccess={openAccess} />
            </li>
          ))}
        </ul>
      )}
      {empty.length > 0 ? (
        <Button type="link" size="small" className={outputStyles.toggle} onClick={() => setShowEmpty((value) => !value)}>
          {showEmpty ? '收起没有成片的批次' : `显示 ${empty.length} 个没有成片的批次（失败或已取消）`}
        </Button>
      ) : null}
      <p className={styles.fieldHelp}>
        {openAccess ? '显示所有人最近 50 个批次（框架混剪与单条剪辑），任何已登录账号都可查看和取消。' : '显示最近 50 个批次（框架混剪与单条剪辑）。'}
      </p>
      <p className={styles.fieldHelp} role="status" aria-live="polite">
        {pollPaused ? '自动刷新已暂停（超过 30 分钟），点「刷新」查看最新进度。' : ''}
      </p>
    </article>
  );
}

function BatchDetail({ batchId, presets, openAccess }: { batchId: string; presets: readonly StudioSegmentPreset[]; openAccess: boolean }) {
  const { query, refresh, pollPaused } = useRemixBatch(batchId);
  const cancel = useCancelRemixBatch(batchId);
  // Refreshing restarts the polling window so stopping renders are followed to the end.
  const cancelUnfinished = () => cancel.mutate(undefined, { onSuccess: () => void refresh() });
  return (
    <RemixBatchDetailView
      detail={query.data}
      presets={presets}
      openAccess={openAccess}
      loading={query.isPending}
      error={query.isError ? errorText(query.error) : null}
      refreshing={query.isFetching}
      onRefresh={() => void refresh()}
      cancelling={cancel.isPending}
      cancelError={cancel.isError ? errorText(cancel.error) : null}
      onCancel={cancelUnfinished}
      pollPaused={pollPaused}
    />
  );
}

/** 成片 page body: batch list, or one batch when `?batch=` is set. */
export function RemixOutputsView({ capabilities }: { capabilities: StudioCapabilitiesResponse }) {
  const [params] = useSearchParams();
  const batchId = params.get(REMIX_BATCH_PARAM);
  const presetsQuery = useStudioPresets(capabilities.remixEnabled);
  const presets = presetsQuery.data ?? [];
  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">成片</h1>
          <p>框架混剪与单条剪辑的成片：在这里预览、下载，成片同时回存素材库并记录来源片段。</p>
        </div>
        {capabilities.remixEnabled ? null : <Badge status="neutral">尚未启用</Badge>}
      </header>
      {!capabilities.remixEnabled ? (
        <article className={pageStyles.card}>
          <h2>框架混剪未启用</h2>
          <p>当前环境没有开启框架混剪批量出片，这里没有批次可显示。单条 AI 剪辑任务的成片仍在 AI 剪辑的任务详情里播放和下载。</p>
          <div className={pageStyles.nextAction}>
            <RouterLink className={pageStyles.actionLink} to={buildEditingModePath(false)}>
              打开 AI 剪辑
            </RouterLink>
          </div>
        </article>
      ) : batchId ? (
        <BatchDetail batchId={batchId} presets={presets} openAccess={capabilities.openAccess} />
      ) : (
        <BatchList presets={presets} openAccess={capabilities.openAccess} />
      )}
    </section>
  );
}
