import { ROUTE_PATHS } from '@/lib/route-policy-registry';

/**
 * AI 剪辑 opens on framework remix; `?mode=single` selects single-task editing.
 * `?mode=remix` stays valid for saved links.
 */
export const EDITING_MODE_PARAM = 'mode';
export const EDITING_REMIX_MODE = 'remix';
export const EDITING_SINGLE_MODE = 'single';
/** Single-task deep links (`/editing/:runId`, legacy library links) carry this. */
export const EDITING_RUN_PARAM = 'editingRun';

export const REMIX_BATCH_PARAM = 'batch';

export function buildEditingModePath(remix: boolean): string {
  return remix
    ? ROUTE_PATHS.contentAiStudioEditing
    : `${ROUTE_PATHS.contentAiStudioEditing}?${EDITING_MODE_PARAM}=${EDITING_SINGLE_MODE}`;
}

/** Outputs route focused on one batch. */
export function buildRemixBatchPath(batchId: string): string {
  return `${ROUTE_PATHS.contentAiStudioOutputs}?${new URLSearchParams({ [REMIX_BATCH_PARAM]: batchId }).toString()}`;
}

/** Stable task URL of one output Run (hands off to the AI 剪辑 task detail). */
export function buildEditingRunPath(runId: string): string {
  return ROUTE_PATHS.contentAiStudioEditingRun.replace(':runId', encodeURIComponent(runId));
}

/** 素材库 asset detail of one output or source asset (opened in a new tab by callers). */
export function buildContentAssetDetailPath(assetId: string): string {
  return ROUTE_PATHS.marketingContentAssetDetail.replace(':assetId', encodeURIComponent(assetId));
}

/** 成片 → 单条剪辑: `?mode=single&fromBatch=<id>&ordinal=<n>` starts the 剪辑台 from that output. */
export const EDIT_FROM_BATCH_PARAM = 'fromBatch';
export const EDIT_FROM_ORDINAL_PARAM = 'ordinal';

export function buildEditFromOutputPath(batchId: string, ordinal: number): string {
  const params = new URLSearchParams({
    [EDITING_MODE_PARAM]: EDITING_SINGLE_MODE,
    [EDIT_FROM_BATCH_PARAM]: batchId,
    [EDIT_FROM_ORDINAL_PARAM]: String(ordinal),
  });
  return `${ROUTE_PATHS.contentAiStudioEditing}?${params.toString()}`;
}
