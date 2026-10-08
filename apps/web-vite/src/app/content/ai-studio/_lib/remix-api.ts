import type { BadgeStatus } from '@/components/atoms/badge';
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
  StudioCreateRemixEditRequest,
  StudioRemixEditCheckRequest,
  StudioRemixEditCheckResponse,
  StudioRemixEditMatch,
};

/** Creating a batch queues renders; a lost response must never be replayed automatically. */
const NO_RETRY = { retryAttempts: 0 } as const;

export const remixQueryKeys = {
  products: (presetKey: string, presetVersion: number) =>
    [...aiStudioQueryKeys.root, 'remix-products', presetKey, presetVersion] as const,
  preview: (request: StudioRemixBatchPreviewRequest) => [...aiStudioQueryKeys.root, 'remix-preview', request] as const,
  batches: () => [...aiStudioQueryKeys.root, 'remix-batches'] as const,
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

const BATCH_STATUS_VIEWS: Record<string, { label: string; tone: BadgeStatus }> = {
  running: { label: '出片中', tone: 'info' },
  succeeded: { label: '全部完成', tone: 'success' },
  partially_failed: { label: '部分失败', tone: 'warning' },
  failed: { label: '失败', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'neutral' },
};

export function remixBatchStatusView(status: string): { label: string; tone: BadgeStatus } {
  return BATCH_STATUS_VIEWS[status] ?? { label: status, tone: 'neutral' };
}

const RUN_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '渲染中',
  paused: '已暂停',
  cancelling: '取消中',
};

const WAITING_REASON_LABELS: Record<string, string> = {
  render_failed: '渲染失败',
  render_cancelled: '渲染已取消',
  render_paused: '渲染已暂停',
  render_superseded: '渲染已被新版本替代',
  invalid_render_receipt: '成片技术检查未通过',
  remix_lineage_mismatch: '成片与批次组合不一致，未回存',
  remix_output_failed: '成片回存素材库失败',
};

/** Readable failure of an output (or a batch's first failed output); null when there is none. */
export function remixWaitingReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return WAITING_REASON_LABELS[reason] ?? '失败';
}

/** One output's badge: running states by Run status, failures by the Run's waiting reason. */
export function remixItemStatusView(item: Pick<StudioRemixBatchItem, 'outcome' | 'runStatus' | 'waitingReason' | 'jobStatus'>): {
  label: string;
  tone: BadgeStatus;
} {
  if (item.outcome === 'succeeded') return { label: '已完成', tone: 'success' };
  if (item.outcome === 'running') {
    const label = item.runStatus === 'running' && item.jobStatus === 'queued' ? '排队中' : RUN_STATUS_LABELS[item.runStatus];
    return { label: label ?? '处理中', tone: 'info' };
  }
  if (item.outcome === 'cancelled' || item.runStatus === 'cancelled') return { label: '已取消', tone: 'neutral' };
  return { label: (item.waitingReason && WAITING_REASON_LABELS[item.waitingReason]) || '失败', tone: 'danger' };
}

/** Run states a batch cancel leaves untouched (mirrors the server's settled set). */
const CANCEL_SETTLED_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'cancelling']);

/** True when at least one output can still be cancelled. */
export function hasCancellableRemixItems(items: readonly Pick<StudioRemixBatchItem, 'runStatus'>[]): boolean {
  return items.some((item) => !CANCEL_SETTLED_RUN_STATUSES.has(item.runStatus));
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
