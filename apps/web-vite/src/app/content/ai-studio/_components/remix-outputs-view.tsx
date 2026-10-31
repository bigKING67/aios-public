import { Alert, Button, Pagination, SkeletonText, Tooltip } from '@lobehub/ui';
import { Info, Video } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import type { StudioCapabilitiesResponse, StudioSegmentPreset } from '../_lib/ai-studio-api';
import {
  parseRemixBatchMode,
  remixBatchOwnerLabel,
  remixBatchDeletedCount,
  remixBatchReviewSummary,
  remixModeLabel,
  remixWaitingReasonLabel,
  REMIX_BATCH_PAGE_SIZE,
  type RemixBatchMode,
  type StudioRemixBatch,
  type StudioRemixBatchListResponse,
} from '../_lib/remix-api';
import { remixBatchStructureText } from '../_lib/remix-form';
import { groupRemixBatchesForCurrentPage } from '../_lib/remix-groups';
import {
  buildEditingModePath,
  buildRemixBatchPath,
  buildRemixOutputPath,
  editingModeForBatchMode,
  OUTPUTS_FILTER_PARAM,
  OUTPUTS_MODE_PARAM,
  OUTPUTS_PAGE_PARAM,
  OUTPUTS_PENDING,
  OUTPUTS_QUALITY_FAILED,
  OUTPUTS_QUALITY_PARAM,
  OUTPUTS_REJECTED,
  OUTPUTS_REVIEW_PARAM,
  OUTPUTS_WITHOUT,
  outputsListParams,
  REMIX_BATCH_PARAM,
  REMIX_OUTPUT_PARAM,
} from '../_lib/remix-routes';
import { formatShortTimestamp } from '../_lib/studio-time';
import { RemixBatchDetailView } from './remix-batch-detail';
import { RemixOutputReviewView } from './remix-output-review';
import { ListChips, type ListTab } from './remix-list-chips';
import { RemixBatchStatus } from './remix-status';
import { useStudioPresets } from './use-ai-studio-queries';
import {
  useCancelRemixBatch,
  useRemixBatch,
  useRemixBatchPage,
  useRemixOutputReview,
  useRetryRemixDelivery,
} from './use-remix-batches';
import pageStyles from '../ai-studio.module.css';
import outputStyles from './remix-outputs.module.css';
import styles from './segment-annotation.module.css';
import workbenchStyles from './studio-workbench.module.css';
import { RefreshButton } from './refresh-button';

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

const COVER_SLOTS = 4;

/**
 * One batch per row (a batch is a job of up to ten outputs, not one video): a strip of up to four
 * output thumbnails, product · type over the full structure, then status with progress and time
 * with the creator in fixed columns so every row lines up. Output media cards live on the batch page.
 */
function BatchRow({ batch, presets, openAccess, listLink }: { batch: StudioRemixBatch; presets: readonly StudioSegmentPreset[]; openAccess: boolean; listLink: URLSearchParams }) {
  const structure = remixBatchStructureText(batch, presets);
  const failure = batch.failedCount > 0 ? remixWaitingReasonLabel(batch.failureReason) : null;
  const slots = Math.min(COVER_SLOTS, Math.max(batch.plannedCount, 1));
  const deleted = remixBatchDeletedCount(batch);
  // A batch of one output (单条剪辑, mostly) opens straight on that output's review page.
  const to = batch.plannedCount === 1 ? buildRemixOutputPath(batch.batchId, 1, listLink) : buildRemixBatchPath(batch.batchId, listLink);
  return (
    <RouterLink className={outputStyles.batchRow} to={to} aria-label={`${batch.productName} · ${structure}`}>
      <span className={outputStyles.thumbs} aria-hidden>
        {Array.from({ length: slots }, (_, index) => (
          <span key={index} className={outputStyles.thumb}>
            {/* Later slots sit on top in the stack, so only the last empty one carries the icon. */}
            {batch.coverUrls[index] ? (
              <img src={batch.coverUrls[index]} alt="" loading="lazy" />
            ) : index === slots - 1 ? (
              <Video size={14} strokeWidth={1.6} />
            ) : null}
          </span>
        ))}
      </span>
      <span className={outputStyles.batchMain}>
        <span className={outputStyles.batchTitle}>
          <span className={outputStyles.title} title={batch.productName}>{batch.productName}</span>
          <span className={outputStyles.batchType}>{remixModeLabel(batch.mode)}</span>
        </span>
        <span className={outputStyles.structure} title={structure}>{structure}</span>
        {failure ? <span className={outputStyles.failure}>失败原因：{failure}</span> : null}
      </span>
      <span className={outputStyles.batchState}>
        <RemixBatchStatus batch={batch} />
        <span className={outputStyles.meta}>
          {remixBatchReviewSummary(batch).map((text) => <span key={text}>{text}</span>)}
          <span>完成 {batch.succeededCount} / {batch.plannedCount} 条</span>
          {batch.runningCount > 0 ? <span>渲染中 {batch.runningCount}</span> : null}
          {batch.failedCount > 0 ? <span>失败 {batch.failedCount}</span> : null}
          {batch.qcFailedCount > 0 ? <span>质检未通过 {batch.qcFailedCount} 条</span> : null}
          {batch.cancelledCount > 0 ? <span>已取消 {batch.cancelledCount}</span> : null}
          {deleted > 0 ? <span>已删除 {deleted} 条</span> : null}
          {batch.plannedCount < batch.requestedCount ? <span>请求 {batch.requestedCount} 条</span> : null}
        </span>
      </span>
      <span className={outputStyles.batchWhen}>
        <span>{formatShortTimestamp(batch.createdAt)}</span>
        {openAccess ? <span>{remixBatchOwnerLabel(batch)}</span> : null}
      </span>
    </RouterLink>
  );
}

type ModeCounts = StudioRemixBatchListResponse['counts']['withOutputs'];

function modeCount(counts: ModeCounts, mode: RemixBatchMode | null): number {
  return mode ? counts[mode] : counts.all;
}

function readPage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** The first page stays implicit, so the plain 成片 URL is page 1. */
function setPage(params: URLSearchParams, page: number) {
  if (page > 1) params.set(OUTPUTS_PAGE_PARAM, String(page));
  else params.delete(OUTPUTS_PAGE_PARAM);
}

/**
 * Every batch in scope, 20 per numbered page. The type chips list batches that still have outputs;
 * 未成片 (failed, cancelled or all outputs deleted — noise on 成片, one click away) lists the rest.
 * The API filters and counts over the whole scope. Tab and page live in the URL, so a batch's back
 * link returns to them. `openAccess`: every signed-in user sees every batch, so the creator is shown.
 */
function BatchList({ presets, openAccess }: { presets: readonly StudioSegmentPreset[]; openAccess: boolean }) {
  const [params, setParams] = useSearchParams();
  const rejected = params.get(OUTPUTS_REVIEW_PARAM) === OUTPUTS_REJECTED;
  const qualityFailed = !rejected && params.get(OUTPUTS_QUALITY_PARAM) === OUTPUTS_QUALITY_FAILED;
  const pending = !rejected && !qualityFailed && params.get(OUTPUTS_REVIEW_PARAM) === OUTPUTS_PENDING;
  const without = !rejected && !qualityFailed && !pending && params.get(OUTPUTS_FILTER_PARAM) === OUTPUTS_WITHOUT;
  const mode = rejected || qualityFailed || pending || without ? null : parseRemixBatchMode(params.get(OUTPUTS_MODE_PARAM));
  const tab: ListTab = rejected ? OUTPUTS_REJECTED : qualityFailed ? OUTPUTS_QUALITY_FAILED : pending ? OUTPUTS_PENDING : without ? OUTPUTS_WITHOUT : mode;
  const page = readPage(params.get(OUTPUTS_PAGE_PARAM));
  const { query, batches, counts, refresh, pollPaused } = useRemixBatchPage(
    rejected
      ? { mode: null, outputs: null, review: 'rejected' }
      : qualityFailed
      ? { mode: null, outputs: null, review: null, quality: 'failed' }
      : pending
        ? { mode: null, outputs: null, review: 'pending' }
        : { mode, outputs: without ? 'without' : 'with', review: null },
    page,
    true,
  );
  const listRef = useRef<HTMLElement>(null);
  const total = counts
    ? rejected
      ? counts.rejected.all
      : qualityFailed
      ? counts.qcFailed.all
      : pending
      ? counts.pendingReview.all
      : without
        ? counts.withoutOutputs.all
        : modeCount(counts.withOutputs, mode)
    : 0;
  const pageCount = Math.max(1, Math.ceil(total / REMIX_BATCH_PAGE_SIZE));
  const nothingAtAll = counts !== null && counts.withOutputs.all + counts.withoutOutputs.all + counts.rejected.all === 0;
  const scopeNote = `${openAccess ? '所有已登录账号都能查看和取消这里的批次。' : '这里只显示你发起的批次。'}类型后的数字为普通成片批次；已驳回记录单独保留，质检未通过按含问题条目的批次计数。`;
  const listLink = outputsListParams(params);
  const groupedBatches = groupRemixBatchesForCurrentPage(batches, presets);
  const update = (change: (next: URLSearchParams) => void) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        change(next);
        return next;
      },
      { replace: true },
    );
  const selectTab = (next: ListTab) =>
    update((updated) => {
      updated.delete(OUTPUTS_PAGE_PARAM);
      updated.delete(OUTPUTS_MODE_PARAM);
      updated.delete(OUTPUTS_FILTER_PARAM);
      updated.delete(OUTPUTS_REVIEW_PARAM);
      updated.delete(OUTPUTS_QUALITY_PARAM);
      if (next === OUTPUTS_REJECTED) updated.set(OUTPUTS_REVIEW_PARAM, OUTPUTS_REJECTED);
      else if (next === OUTPUTS_QUALITY_FAILED) updated.set(OUTPUTS_QUALITY_PARAM, OUTPUTS_QUALITY_FAILED);
      else if (next === OUTPUTS_PENDING) updated.set(OUTPUTS_REVIEW_PARAM, OUTPUTS_PENDING);
      else if (next === OUTPUTS_WITHOUT) updated.set(OUTPUTS_FILTER_PARAM, OUTPUTS_WITHOUT);
      else if (next) updated.set(OUTPUTS_MODE_PARAM, next);
    });
  const selectPage = (next: number) => {
    update((updated) => setPage(updated, next));
    // The pager sits under the rows; a new page starts reading at its first row.
    const list = listRef.current;
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: 'start' });
  };
  // A page emptied by deletions (or a stale link) falls back to the last page that has rows.
  const pastEnd = counts !== null && page > pageCount;
  useEffect(() => {
    if (!pastEnd) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        setPage(next, pageCount);
        return next;
      },
      { replace: true },
    );
  }, [pastEnd, pageCount, setParams]);
  return (
    // No second title under 成片: the chips and refresh open the list, the scope is its label.
    <article ref={listRef} className={pageStyles.card} aria-label={openAccess ? '全部成片批次' : '我的成片批次'}>
      <div className={outputStyles.toolbar}>
        {query.isError ? (
          <Alert type="error" showIcon title="批次读取失败" description={errorText(query.error)} action={<Button onClick={() => void refresh()}>重试</Button>} />
        ) : !counts ? (
          <SkeletonText rows={1} />
        ) : nothingAtAll ? (
          <p className={styles.fieldHelp}>{openAccess ? '还没有人生成过成片。' : '你还没有生成过成片。'}</p>
        ) : (
          <ListChips counts={counts} tab={tab} onSelect={selectTab} />
        )}
        <span className={outputStyles.toolbarEnd}>
          <Tooltip title={scopeNote}>
            <Info size={14} strokeWidth={1.8} className={workbenchStyles.infoIcon} tabIndex={0} aria-label={scopeNote} />
          </Tooltip>
          <RefreshButton onRefresh={() => void refresh()} loading={query.isFetching} />
        </span>
      </div>
      {counts && !nothingAtAll && total === 0 && !query.isFetching ? (
        <p className={styles.fieldHelp}>{rejected ? '没有已驳回的成片记录。' : qualityFailed ? '没有自动质检未通过或未完成的成片。' : pending ? '没有待审核的成片。' : without ? '没有未成片的批次。' : mode ? `还没有${remixModeLabel(mode)}的成片。` : '还没有出成片的批次。'}</p>
      ) : null}
      {batches.length > 0 ? (
        <div className={outputStyles.pageGroups} aria-label="当前页成片批次分组">
          <p className={outputStyles.groupingNote}>第 {Math.min(page, pageCount)} / {pageCount} 页 · 当前页按北京时间与结构分组</p>
          {groupedBatches.map((dateGroup) => (
            <section key={dateGroup.dateKey} className={outputStyles.dateGroup} aria-labelledby={`remix-date-${dateGroup.dateKey}`}>
              <h2 id={`remix-date-${dateGroup.dateKey}`} className={outputStyles.dateHeading}>{dateGroup.dateLabel}</h2>
              {dateGroup.structures.map((structureGroup, structureIndex) => (
                <section key={structureGroup.structure} className={outputStyles.structureGroup} aria-labelledby={`remix-structure-${dateGroup.dateKey}-${structureIndex}`}>
                  <h3 id={`remix-structure-${dateGroup.dateKey}-${structureIndex}`} className={outputStyles.structureHeading}>{structureGroup.structure}</h3>
                  <ul className={outputStyles.batchRows} aria-label={`${dateGroup.dateLabel} · ${structureGroup.structure}`}>
                    {structureGroup.batches.map((batch) => (
                      <li key={batch.batchId}>
                        <BatchRow batch={batch} presets={presets} openAccess={openAccess} listLink={listLink} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ))}
        </div>
      ) : null}
      {total > REMIX_BATCH_PAGE_SIZE ? (
        <div className={outputStyles.pagination}>
          <Pagination
            current={Math.min(page, pageCount)}
            pageSize={REMIX_BATCH_PAGE_SIZE}
            total={total}
            showSizeChanger={false}
            showTotal={(count) => `共 ${count} 个批次`}
            onChange={selectPage}
          />
        </div>
      ) : null}
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

/** One output's review page (`?batch=&output=`); shares the batch query with the batch page. */
function OutputReview({ batchId, ordinal, presets, openAccess }: { batchId: string; ordinal: number; presets: readonly StudioSegmentPreset[]; openAccess: boolean }) {
  const { query, refresh } = useRemixBatch(batchId);
  const review = useRemixOutputReview(batchId);
  const delivery = useRetryRemixDelivery(batchId);
  return (
    <RemixOutputReviewView
      detail={query.data}
      ordinal={ordinal}
      presets={presets}
      openAccess={openAccess}
      loading={query.isPending}
      error={query.isError ? errorText(query.error) : null}
      refreshing={query.isFetching}
      onRefresh={() => void refresh()}
      onReview={(request) => review.mutate({ ordinal, request })}
      reviewing={review.isPending}
      reviewError={review.isError ? errorText(review.error) : null}
      onRetryDelivery={() => delivery.mutate(ordinal)}
      deliveryRetrying={delivery.isPending}
      deliveryError={delivery.isError ? errorText(delivery.error) : null}
    />
  );
}

/** 成片 page body: batch list, one batch when `?batch=` is set, one output's review with `&output=`. */
export function RemixOutputsView({ capabilities }: { capabilities: StudioCapabilitiesResponse }) {
  const [params] = useSearchParams();
  const batchId = params.get(REMIX_BATCH_PARAM);
  const outputOrdinal = Number(params.get(REMIX_OUTPUT_PARAM));
  const mode = parseRemixBatchMode(params.get(OUTPUTS_MODE_PARAM));
  const presetsQuery = useStudioPresets(capabilities.remixEnabled);
  const presets = presetsQuery.data ?? [];
  return (
    <section className={pageStyles.panel} aria-labelledby="ai-studio-page-title">
      <header className={pageStyles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">成片</h1>
          <p>框架混剪、卖点混剪与单条剪辑的成片：在这里预览、下载，并记录来源片段。</p>
        </div>
        {!capabilities.remixEnabled ? (
          <Badge status="neutral">尚未启用</Badge>
        ) : batchId ? null : (
          // Starts a batch of the type on screen (框架混剪 under 全部).
          <RouterLink className={styles.secondaryLink} to={buildEditingModePath(editingModeForBatchMode(mode ?? 'framework'))}>
            {mode === 'edit' ? '新建剪辑' : '新建批次'}
          </RouterLink>
        )}
      </header>
      {!capabilities.remixEnabled ? (
        <article className={pageStyles.card}>
          <h2>框架混剪未启用</h2>
          <p>当前环境没有开启框架混剪批量出片，这里没有批次可显示。单条剪辑任务的成片仍在 AI 合成的任务详情里播放和下载。</p>
          <div className={pageStyles.nextAction}>
            <RouterLink className={pageStyles.actionLink} to={buildEditingModePath('single')}>
              打开 AI 合成
            </RouterLink>
          </div>
        </article>
      ) : batchId && Number.isInteger(outputOrdinal) && outputOrdinal > 0 ? (
        <OutputReview batchId={batchId} ordinal={outputOrdinal} presets={presets} openAccess={capabilities.openAccess} />
      ) : batchId ? (
        <BatchDetail batchId={batchId} presets={presets} openAccess={capabilities.openAccess} />
      ) : (
        <BatchList presets={presets} openAccess={capabilities.openAccess} />
      )}
    </section>
  );
}
