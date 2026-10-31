import type { AiTaskView } from '@/components/molecules/ai-task-status';
import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type StudioCreateRemixBatchRequest,
  type StudioCreateRemixEditRequest,
  type StudioRemixBatch,
  type StudioRemixBatchDetail,
  type StudioRemixBatchItem,
  type StudioRemixBatchListResponse,
  type StudioRemixBatchPreviewRequest,
  type StudioRemixBatchPreviewResponse,
  type StudioRemixBatchSegment,
  type StudioRemixEditCheckRequest,
  type StudioRemixEditCheckResponse,
  type StudioRemixEditMatch,
  type StudioRemixOutputReview,
  type StudioRemixOutputReviewRequest,
  type StudioRemixProductListResponse,
} from '@/lib/generated-api-contract';
import { aiStudioQueryKeys } from './ai-studio-api';

export type {
  StudioCreateRemixBatchRequest,
  StudioRemixBatch,
  StudioRemixBatchDetail,
  StudioRemixBatchItem,
  StudioRemixBatchPreviewRequest,
  StudioRemixBatchPreviewResponse,
  StudioRemixBatchSegment,
  StudioRemixBatchListResponse,
  StudioCreateRemixEditRequest,
  StudioRemixEditCheckRequest,
  StudioRemixEditCheckResponse,
  StudioRemixEditMatch,
  StudioRemixOutputReview,
  StudioRemixOutputReviewRequest,
};

/** Creating a batch queues renders; a lost response must never be replayed automatically. */
const NO_RETRY = { retryAttempts: 0 } as const;

export const remixQueryKeys = {
  products: (presetKey: string, presetVersion: number) =>
    [...aiStudioQueryKeys.root, 'remix-products', presetKey, presetVersion] as const,
  preview: (request: StudioRemixBatchPreviewRequest) => [...aiStudioQueryKeys.root, 'remix-preview', request] as const,
  batches: () => [...aiStudioQueryKeys.root, 'remix-batches'] as const,
  /** 成片 pages under `batches()`, so every batch write also refreshes them. */
  batchPage: (filter: RemixBatchPageFilter, page: number) => [...aiStudioQueryKeys.root, 'remix-batches', 'pages', filter, page] as const,
  batch: (batchId: string) => [...aiStudioQueryKeys.root, 'remix-batches', batchId] as const,
  editCheck: (request: StudioRemixEditCheckRequest) => [...aiStudioQueryKeys.root, 'remix-edit-check', request] as const,
};

export async function fetchRemixProducts(presetKey: string, presetVersion: number, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioRemixProductListResponse>(AIOS_API_PATHS.contentStudioSegmentProducts, {
      params: { presetKey, presetVersion },
      signal: options?.signal,
    })
  ).data.items;
}

/** Read-only availability check; safe to repeat. */
export async function previewRemixBatch(request: StudioRemixBatchPreviewRequest, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.post<StudioRemixBatchPreviewResponse>(AIOS_API_PATHS.contentStudioRemixBatchesPreview, request, {
      signal: options?.signal,
    })
  ).data;
}

export async function createRemixBatch(request: StudioCreateRemixBatchRequest) {
  return (
    await apiClient.post<StudioRemixBatchDetail>(AIOS_API_PATHS.contentStudioRemixBatches, request, NO_RETRY)
  ).data;
}

/** 单条剪辑 duplicate/similar check; read-only, safe to repeat. */
export async function checkRemixEdit(request: StudioRemixEditCheckRequest, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.post<StudioRemixEditCheckResponse>(AIOS_API_PATHS.contentStudioRemixEditsCheck, request, {
      signal: options?.signal,
    })
  ).data;
}

/** Creates one 单条剪辑 output (a one-Run batch); never replayed automatically. */
export async function createRemixEdit(request: StudioCreateRemixEditRequest) {
  return (await apiClient.post<StudioRemixBatchDetail>(AIOS_API_PATHS.contentStudioRemixEdits, request, NO_RETRY)).data;
}

/** 成片 list filter: one type or all; output availability; or one review-record state. */
export interface RemixBatchPageFilter {
  mode: RemixBatchMode | null;
  outputs: 'with' | 'without' | null;
  review: 'pending' | 'rejected' | null;
  /** Failed or incomplete automatic QC; omitted by older callers and fixtures. */
  quality?: 'failed' | null;
}

export const REMIX_BATCH_PAGE_SIZE = 20;

/** One numbered page (1-based) of the 成片 list, newest first; counts cover every batch in scope. */
export async function fetchRemixBatchPage(
  filter: RemixBatchPageFilter,
  page: number,
  options?: { signal?: AbortSignal },
) {
  return (
    await apiClient.get<StudioRemixBatchListResponse>(AIOS_API_PATHS.contentStudioRemixBatches, {
      params: {
        ...(filter.mode ? { mode: filter.mode } : {}),
        ...(filter.outputs ? { outputs: filter.outputs } : {}),
        ...(filter.review ? { review: filter.review } : {}),
        ...(filter.quality ? { quality: filter.quality } : {}),
        page,
        limit: REMIX_BATCH_PAGE_SIZE,
      },
      signal: options?.signal,
    })
  ).data;
}

/** The newest page of every type (AI 合成's 最近批次, the 单条剪辑 picker). */
export async function fetchRemixBatches(options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioRemixBatchListResponse>(AIOS_API_PATHS.contentStudioRemixBatches, {
      signal: options?.signal,
    })
  ).data.items;
}

export async function fetchRemixBatch(batchId: string, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioRemixBatchDetail>(AIOS_API_PATHS.contentStudioRemixBatch(batchId), {
      signal: options?.signal,
    })
  ).data;
}

/**
 * Cancels the batch's unfinished outputs. Idempotent on the server, but a lost
 * response is still not replayed automatically; the caller re-reads the batch.
 */
export async function cancelRemixBatch(batchId: string) {
  return (
    await apiClient.post<StudioRemixBatchDetail>(AIOS_API_PATHS.contentStudioRemixBatchCancel(batchId), undefined, NO_RETRY)
  ).data;
}

/** Requeues one failed cloud-video delivery; a lost response must never be replayed automatically. */
export async function retryRemixDelivery(batchId: string, ordinal: number) {
  return (
    await apiClient.post<StudioRemixBatchDetail>(
      AIOS_API_PATHS.contentStudioRemixDeliveryRetry(batchId, ordinal),
      undefined,
      NO_RETRY,
    )
  ).data;
}

/** Approves or rejects one output (replacing an earlier review); returns the batch detail. */
export async function reviewRemixOutput(batchId: string, ordinal: number, request: StudioRemixOutputReviewRequest) {
  return (
    await apiClient.put<StudioRemixBatchDetail>(AIOS_API_PATHS.contentStudioRemixOutputReview(batchId, ordinal), request, NO_RETRY)
  ).data;
}

/** Clears one output's review (back to 待审核); returns the batch detail. */
export async function clearRemixOutputReview(batchId: string, ordinal: number) {
  return (await apiClient.delete<StudioRemixBatchDetail>(AIOS_API_PATHS.contentStudioRemixOutputReview(batchId, ordinal), NO_RETRY)).data;
}

/** Rejection reasons, in the order the review form offers them (the server allowlists the keys). */
export const REMIX_REVIEW_REASONS = [
  { key: 'duplicate_picture', label: '画面重复' },
  { key: 'frame_drop', label: '掉帧' },
  { key: 'wrong_framework', label: '框架用错' },
  { key: 'voice_break', label: '口播不连贯' },
  { key: 'wrong_product', label: '产品不对' },
  { key: 'pacing', label: '节奏不对' },
  { key: 'other', label: '其他' },
] as const;

export function remixReviewReasonLabel(key: string): string {
  return REMIX_REVIEW_REASONS.find((reason) => reason.key === key)?.label ?? key;
}

/** 待审核 is AI-finished and waiting for a person; 已通过 / 已驳回 are the person's call. */
export type RemixReviewState = 'pending' | 'approved' | 'rejected';

export const REMIX_REVIEW_LABELS: Record<RemixReviewState, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};

/** An output a person can review: delivered and still in the library. */
export function isRemixItemReviewable(item: Pick<StudioRemixBatchItem, 'outcome' | 'outputAssetId' | 'outputDeleted' | 'qc'>): boolean {
  return item.outcome === 'succeeded' && Boolean(item.outputAssetId) && !item.outputDeleted && item.qc?.status !== 'failed' && item.qc?.status !== 'incomplete';
}

/** One output's review state, or null when it cannot be reviewed (rendering, failed, deleted). */
export function remixItemReviewState(
  item: Pick<StudioRemixBatchItem, 'outcome' | 'outputAssetId' | 'outputDeleted' | 'review'>,
): RemixReviewState | null {
  if (item.review?.decision === 'approved') return 'approved';
  if (item.review?.decision === 'rejected') return 'rejected';
  if (!isRemixItemReviewable(item)) return null;
  return 'pending';
}

type BatchReviewCounts = Pick<StudioRemixBatch, 'reviewableCount' | 'approvedCount' | 'rejectedCount'>;

export function remixBatchPendingReviewCount(batch: BatchReviewCounts): number {
  return Math.max(0, batch.reviewableCount - batch.approvedCount - batch.rejectedCount);
}

/**
 * A settled batch with reviewable outputs reads by review: 待审核 while any is waiting, then
 * 已通过 once one passed, 已驳回 when every one was rejected. Null leaves the AI task status
 * (出片中, 失败, 已取消, 成片已删除).
 */
export function remixBatchReviewState(batch: BatchReviewCounts & Pick<StudioRemixBatch, 'runningCount'>): RemixReviewState | null {
  if (batch.runningCount > 0 || batch.reviewableCount === 0) return null;
  if (remixBatchPendingReviewCount(batch) > 0) return 'pending';
  return batch.approvedCount > 0 ? 'approved' : 'rejected';
}

/** 待审核 n · 已通过 m · 已驳回 k, skipping zeros; empty when nothing can be reviewed. */
export function remixBatchReviewSummary(batch: BatchReviewCounts): string[] {
  return [
    [REMIX_REVIEW_LABELS.pending, remixBatchPendingReviewCount(batch)],
    [REMIX_REVIEW_LABELS.approved, batch.approvedCount],
    [REMIX_REVIEW_LABELS.rejected, batch.rejectedCount],
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([label, count]) => `${label} ${count}`);
}

const BATCH_STATUS_VIEWS: Record<string, AiTaskView> = {
  running: { label: '出片中', state: 'generating' },
  succeeded: { label: '已完成', state: 'done' },
  // Some outputs exist (a done state); the failed count and reason ride along as detail.
  partially_failed: { label: '部分完成', state: 'done' },
  failed: { label: '失败', state: 'failed' },
  cancelled: { label: '已取消', state: 'cancelled' },
  // Derived (总览 activity): delivered outputs were all deleted from the library.
  outputs_deleted: { label: '成片已删除', state: 'cancelled' },
};

export function remixBatchStatusView(status: string): AiTaskView {
  return BATCH_STATUS_VIEWS[status] ?? { label: status, state: 'queued' };
}

type BatchOutputCounts = Pick<StudioRemixBatch, 'availableCount' | 'runningCount' | 'succeededCount'>;

/** Settled with nothing to watch: failed, cancelled, or every output since deleted from the library. */
export function isRemixBatchWithoutOutputs(batch: BatchOutputCounts): boolean {
  return batch.availableCount === 0 && batch.runningCount === 0;
}

/** Rejected outputs have their own archive and must not appear as deleted files. */
export function remixBatchDeletedCount(batch: Pick<StudioRemixBatch, 'availableCount' | 'succeededCount' | 'rejectedCount'>): number {
  return Math.max(0, batch.succeededCount - batch.availableCount - batch.rejectedCount);
}

/** Outputs were delivered, but all of them have since been deleted from the library. */
export function areRemixBatchOutputsDeleted(batch: BatchOutputCounts): boolean {
  return batch.succeededCount > 0 && isRemixBatchWithoutOutputs(batch);
}

/** Batch status as shown on 成片: a batch whose outputs were all deleted no longer reads as 已完成. */
export function remixBatchView(batch: BatchOutputCounts & Pick<StudioRemixBatch, 'status'>): AiTaskView {
  return remixBatchStatusView(areRemixBatchOutputsDeleted(batch) ? 'outputs_deleted' : batch.status);
}

/** Share of planned outputs finished, for a running batch's progress. */
export function remixBatchProgress(batch: Pick<StudioRemixBatch, 'succeededCount' | 'plannedCount'>): number | undefined {
  return batch.plannedCount > 0 ? (batch.succeededCount / batch.plannedCount) * 100 : undefined;
}

const RUN_STATUS_VIEWS: Record<string, AiTaskView> = {
  queued: { label: '排队中', state: 'queued' },
  running: { label: '渲染中', state: 'generating' },
  paused: { label: '已暂停', state: 'queued' },
  cancelling: { label: '取消中', state: 'cancelled' },
};

const WAITING_REASON_LABELS: Record<string, string> = {
  render_failed: '渲染失败',
  render_cancelled: '渲染已取消',
  render_paused: '渲染已暂停',
  render_superseded: '渲染已被新版本替代',
  invalid_render_receipt: '成片技术检查未通过',
  remix_lineage_mismatch: '成片与批次组合不一致，未回存',
  remix_output_failed: '成片保存失败',
  remix_qc_failed: '自动质检未通过',
  remix_qc_incomplete: '自动质检未完成',
  remix_qc_sources_changed: '源片已变化，需重新质检',
};

/** Readable failure of an output (or a batch's first failed output); null when there is none. */
export function remixWaitingReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return WAITING_REASON_LABELS[reason] ?? '失败';
}

/** One output's badge: running states by Run status, failures by the Run's waiting reason. */
export function remixItemStatusView(
  item: Pick<StudioRemixBatchItem, 'outcome' | 'runStatus' | 'waitingReason' | 'jobStatus'>,
): AiTaskView {
  if (item.outcome === 'succeeded') return { label: '已完成', state: 'done' };
  if (item.outcome === 'running') {
    if (item.runStatus === 'running' && item.jobStatus === 'queued') return RUN_STATUS_VIEWS.queued;
    return RUN_STATUS_VIEWS[item.runStatus] ?? { label: '处理中', state: 'generating' };
  }
  if (item.outcome === 'cancelled' || item.runStatus === 'cancelled') return { label: '已取消', state: 'cancelled' };
  return { label: (item.waitingReason && WAITING_REASON_LABELS[item.waitingReason]) || '失败', state: 'failed' };
}

/** Run states a batch cancel leaves untouched (mirrors the server's settled set). */
const CANCEL_SETTLED_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'cancelling']);

/** True when at least one output can still be cancelled. */
export function hasCancellableRemixItems(items: readonly Pick<StudioRemixBatchItem, 'runStatus'>[]): boolean {
  return items.some((item) => !CANCEL_SETTLED_RUN_STATUSES.has(item.runStatus));
}

/** Batch `mode`: `framework` (类型 1), `sellingPoint` (类型 2) or `edit` (单条剪辑). */
export type RemixBatchMode = 'framework' | 'sellingPoint' | 'edit';

/** The two modes the batch remix form runs in. */
export type RemixFormMode = Exclude<RemixBatchMode, 'edit'>;

/** 成片 type tabs, in business order. */
export const REMIX_BATCH_MODES: readonly RemixBatchMode[] = ['framework', 'sellingPoint', 'edit'];

export function parseRemixBatchMode(value: string | null): RemixBatchMode | null {
  return REMIX_BATCH_MODES.find((mode) => mode === value) ?? null;
}

export function remixModeLabel(mode: string): string {
  if (mode === 'edit') return '单条剪辑';
  if (mode === 'sellingPoint') return '卖点混剪';
  return '框架混剪';
}

/** How a 卖点混剪 slot was filled (`RemixBatchSegment.tier`). */
export function remixTierLabel(tier: string | null | undefined, fallback: boolean | null | undefined): string | null {
  if (fallback) return '整段替换';
  if (tier === 'exact') return '卖点一致';
  if (tier === 'spliced') return '多段拼出';
  if (tier === 'varied') return '卖点有变化';
  return null;
}

/** Who started a batch; the caller's own batches read as 「我」. */
export function remixBatchOwnerLabel(
  batch: Pick<StudioRemixBatch, 'ownedByCurrentUser' | 'ownerName' | 'ownerUserId'>,
): string {
  if (batch.ownedByCurrentUser) return '我';
  return batch.ownerName?.trim() || `用户 ${batch.ownerUserId}`;
}

export function isRemixBatchActive(batch: Pick<StudioRemixBatch, 'status'>): boolean {
  return batch.status === 'running';
}

/** Idempotency keys only allow ASCII letters, digits, `_` and `-`. */
export function newRemixIdempotencyKey(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `remix-${random}`;
}
