import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { RemixBatchMode } from './remix-api';

/**
 * AI 合成 opens on framework remix; `?mode=sellingPoint` selects 卖点混剪 and
 * `?mode=single` single-task editing. `?mode=remix` stays valid for saved links.
 */
export const EDITING_MODE_PARAM = 'mode';
export const EDITING_REMIX_MODE = 'remix';
export const EDITING_SELLING_POINT_MODE = 'sellingPoint';
export const EDITING_SINGLE_MODE = 'single';

/** The three AI 合成 tabs. */
export type EditingMode = 'framework' | 'sellingPoint' | 'single';
/** Single-task deep links (`/editing/:runId`, legacy library links) carry this. */
export const EDITING_RUN_PARAM = 'editingRun';

export const REMIX_BATCH_PARAM = 'batch';
/** With `batch`, opens one output's review page (`?batch=<id>&output=<ordinal>`). */
export const REMIX_OUTPUT_PARAM = 'output';
/** 成片 type tab: `?mode=framework|sellingPoint|edit`; absent means all types. */
export const OUTPUTS_MODE_PARAM = 'mode';
/** `?outputs=without` opens the 未成片 tab (every type) instead of a type tab. */
export const OUTPUTS_FILTER_PARAM = 'outputs';
export const OUTPUTS_WITHOUT = 'without';
/** `?review=pending` opens the 待审核 tab (every type, batches with an output waiting for review). */
export const OUTPUTS_REVIEW_PARAM = 'review';
export const OUTPUTS_PENDING = 'pending';
/** `?review=rejected` opens the retained rejection records across every type. */
export const OUTPUTS_REJECTED = 'rejected';
/** `?quality=failed` opens batches that contain at least one failed/incomplete automatic-QC Run. */
export const OUTPUTS_QUALITY_PARAM = 'quality';
export const OUTPUTS_QUALITY_FAILED = 'failed';
/** 成片 list page, 1-based; absent means the first. */
export const OUTPUTS_PAGE_PARAM = 'page';
const OUTPUTS_LIST_PARAMS = [OUTPUTS_MODE_PARAM, OUTPUTS_FILTER_PARAM, OUTPUTS_REVIEW_PARAM, OUTPUTS_QUALITY_PARAM, OUTPUTS_PAGE_PARAM];

/** The 成片 list's own state (tab and page) out of `params`, for links that should return to it. */
export function outputsListParams(params: URLSearchParams): URLSearchParams {
  const list = new URLSearchParams();
  OUTPUTS_LIST_PARAMS.forEach((key) => {
    const value = params.get(key);
    if (value) list.set(key, value);
  });
  return list;
}

export function buildEditingModePath(mode: EditingMode): string {
  if (mode === 'framework') return ROUTE_PATHS.contentAiStudioEditing;
  const value = mode === 'single' ? EDITING_SINGLE_MODE : EDITING_SELLING_POINT_MODE;
  return `${ROUTE_PATHS.contentAiStudioEditing}?${EDITING_MODE_PARAM}=${value}`;
}

/** AI 合成 tab that creates batches of `mode` (单条剪辑 batches come from its single tab). */
export function editingModeForBatchMode(mode: RemixBatchMode): EditingMode {
  return mode === 'edit' ? 'single' : mode;
}

/** 成片 list, on the tab and page `list` carries (see `outputsListParams`). */
export function buildOutputsListPath(list?: URLSearchParams): string {
  const search = list?.toString();
  return search ? `${ROUTE_PATHS.contentAiStudioOutputs}?${search}` : ROUTE_PATHS.contentAiStudioOutputs;
}

/** Outputs route focused on one batch; `list` keeps the list's tab and page for the way back. */
export function buildRemixBatchPath(batchId: string, list?: URLSearchParams): string {
  const params = new URLSearchParams({ [REMIX_BATCH_PARAM]: batchId });
  list?.forEach((value, key) => params.set(key, value));
  return `${ROUTE_PATHS.contentAiStudioOutputs}?${params.toString()}`;
}

/** One output's review page; `list` keeps the list's tab and page for the way back. */
export function buildRemixOutputPath(batchId: string, ordinal: number, list?: URLSearchParams): string {
  const params = new URLSearchParams({ [REMIX_BATCH_PARAM]: batchId, [REMIX_OUTPUT_PARAM]: String(ordinal) });
  list?.forEach((value, key) => params.set(key, value));
  return `${ROUTE_PATHS.contentAiStudioOutputs}?${params.toString()}`;
}

/** Stable task URL of one output Run (hands off to the AI 合成 task detail). */
export function buildEditingRunPath(runId: string): string {
  return ROUTE_PATHS.contentAiStudioEditingRun.replace(':runId', encodeURIComponent(runId));
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
