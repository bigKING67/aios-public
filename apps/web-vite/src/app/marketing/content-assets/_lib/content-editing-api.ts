import { apiClient } from '@/lib/api-client';
import type { ProductionClip, ProductionDraft } from './content-production-api';

export type EditingTaskType = 'smart' | 'talking_head' | 'montage' | 'recut' | 'highlights' | 'variants' | 'picture_remix';
export interface EditingRequest {
  idempotencyKey: string; title: string; brief: string; taskType: EditingTaskType;
  narrationAssetId?: string;
  maxAutoRepairs?: 0 | 1 | 2;
  assetIds: string[]; aspect: ProductionDraft['aspect']; targetSeconds: number;
  reviewBeforeProduction: boolean; modelCallConfirmed: boolean; rightsConfirmed: boolean;
}
export interface CaptionStyle {
  fontHeight: number; centerY: number; color: string; strokeWidth: number; weight: 400 | 600 | 700 | 900;
}
export interface NarrationCaptions {
  assetId: string; sourceSha256: string; cues: { id: string; startMs: number; endMs: number; text: string; style?: CaptionStyle }[];
}
export interface EditingPlan {
  narrationCaptions?: NarrationCaptions;
  summary: string; clips: ProductionClip[]; reasons: string[]; gaps: string[]; lockedClipIds: string[];
}
export interface EditingRun {
  runId: string; version: number; executionVersion: number; planRevision: number;
  status: 'queued' | 'running' | 'waiting' | 'paused' | 'cancelling' | 'cancelled' | 'failed' | 'succeeded';
  stage: string; waitingReason: string | null; request: EditingRequest;
  projectId: string | null; projectRevision: number | null; renderJobId: string | null;
  pauseRequested: boolean; createdAt: string; updatedAt: string;
}
export interface EditingDetail {
  run: EditingRun;
  plan: { revision: number; executionVersion: number; document: EditingPlan; origin: string; createdAt: string } | null;
}
export interface CaptionCandidate {
  status: 'inspection_pending'; deliveryApproved: false; playbackUrl: string; documentSha256: string;
  expectedVersion: number; expectedPlanRevision: number; expectedProjectRevision: number;
  planDocument: EditingPlan;
  captionChanges: { captionId: string; before: string; after: string }[];
  review: { termIssueCount: number; rejectedIssueCount: number };
}
export interface EditingResult {
  automaticRepair?: unknown;
  selectedReview?: { summary?: unknown } | null;
  captionCandidate?: CaptionCandidate;
  ready: boolean; playbackUrl?: string | null;
  job: { jobId: string; status: string; stage: string; errorMessage: string | null } | null;
  inspection?: { scope: 'technical'; status: 'passed'; width: number; height: number; durationSeconds: number; fps: number };
}
const base = '/v1/marketing/content-assets/production/runs';
const noRetry = { retryAttempts: 0 };
export const editingKeys = {
  detail: (id: string | null) => ['content-editing', 'run', id] as const,
  result: (id: string, version: number) => ['content-editing', 'result', id, version] as const,
};
export async function fetchEditingRun(id: string, signal?: AbortSignal) {
  return (await apiClient.get<EditingDetail>(`${base}/${encodeURIComponent(id)}`, { signal })).data;
}
export async function controlEditingRun(run: EditingRun, action: 'plan' | 'pause' | 'resume' | 'cancel') {
  return (await apiClient.post<EditingDetail>(`${base}/${run.runId}/${action}`, { expectedVersion: run.version }, { ...noRetry, timeout: action === 'plan' ? 190000 : 30000 })).data;
}
export async function produceEditingRun(run: EditingRun) {
  return (await apiClient.post<EditingDetail>(`${base}/${run.runId}/produce`, { expectedVersion: run.version, expectedPlanRevision: run.planRevision, expectedProjectRevision: run.projectRevision }, noRetry)).data;
}
export async function reviseEditingPlan(run: EditingRun, document: EditingPlan, unlockClipIds: string[]) {
  return (await apiClient.post<EditingDetail>(`${base}/${run.runId}/plan-revisions`, { expectedVersion: run.version, expectedPlanRevision: run.planRevision, document, unlockClipIds }, noRetry)).data;
}
export async function fetchEditingResult(run: EditingRun) {
  return (await apiClient.get<EditingResult>(`${base}/${run.runId}/result`)).data;
}

export async function adoptEditingCaptionCandidate(run: EditingRun, candidate: CaptionCandidate) {
  if (run.version !== candidate.expectedVersion || run.planRevision !== candidate.expectedPlanRevision || run.projectRevision !== candidate.expectedProjectRevision) {
    throw new Error('候选对应的任务版本已变化，请刷新后再采用。');
  }
  const revised = await reviseEditingPlan(run, candidate.planDocument, []);
  try {
    return (await apiClient.post<EditingDetail>(`${base}/${run.runId}/adopt-plan`, {
      expectedVersion: revised.run.version, expectedPlanRevision: revised.run.planRevision,
      expectedProjectRevision: candidate.expectedProjectRevision,
    }, noRetry)).data;
  } catch {
    throw new Error('字幕方案已保存，但工程采用结果未确认。请刷新任务状态，不要重复采用；可从当前方案继续制作。');
  }
}
