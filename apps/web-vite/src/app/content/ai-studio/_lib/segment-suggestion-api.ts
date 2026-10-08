import type { ContentAssetItem } from '@/app/marketing/content-assets/_lib/content-assets-types';
import type { BadgeStatus } from '@/components/atoms/badge';
import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type StudioCreateSegmentSuggestionsRequest,
  type StudioCreateSegmentSuggestionsResponse,
  type StudioSegmentSuggestionJob,
  type StudioSegmentSuggestionJobListResponse,
} from '@/lib/generated-api-contract';
import { aiStudioQueryKeys, type StudioSegmentPreset } from './ai-studio-api';
import { labelName } from './segment-display';

export type { StudioSegmentSuggestionJob };

/** A lost create response could hide queued (billable) jobs, so the write is never retried. */
const NO_RETRY = { retryAttempts: 0 } as const;

export const segmentSuggestionQueryKeys = {
  jobs: () => [...aiStudioQueryKeys.root, 'segment-suggestions'] as const,
};

export async function createSegmentSuggestionJobs(request: StudioCreateSegmentSuggestionsRequest) {
  return (
    await apiClient.post<StudioCreateSegmentSuggestionsResponse>(
      AIOS_API_PATHS.contentStudioSegmentSuggestions,
      request,
      NO_RETRY,
    )
  ).data;
}

/** The caller's own recent jobs (the API lists every user's jobs only when filtered by asset). */
export async function fetchOwnSegmentSuggestionJobs(options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioSegmentSuggestionJobListResponse>(AIOS_API_PATHS.contentStudioSegmentSuggestions, {
      params: { limit: 20 },
      signal: options?.signal,
    })
  ).data.items;
}

export function isSuggestionJobActive(job: Pick<StudioSegmentSuggestionJob, 'status'>): boolean {
  return job.status === 'queued' || job.status === 'running';
}

const JOB_STATUS_VIEWS: Record<string, { label: string; tone: BadgeStatus }> = {
  queued: { label: '排队中', tone: 'neutral' },
  running: { label: '分析中', tone: 'info' },
  succeeded: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'neutral' },
};

export function suggestionJobStatusView(status: string): { label: string; tone: BadgeStatus } {
  return JOB_STATUS_VIEWS[status] ?? { label: status, tone: 'neutral' };
}

export interface SuggestionJobOutcome {
  inserted: number | null;
  superseded: number | null;
  dropped: number | null;
  /** Suggestions skipped because they repeat an already confirmed segment. */
  confirmedDuplicates: number | null;
}

function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Reads the worker summary defensively; unknown shapes yield nulls instead of invented numbers. */
export function readSuggestionJobOutcome(summary: unknown): SuggestionJobOutcome | null {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
  const record = summary as Record<string, unknown>;
  const dropped = record.dropped;
  let droppedTotal: number | null = null;
  if (dropped && typeof dropped === 'object' && !Array.isArray(dropped)) {
    const counts = Object.values(dropped as Record<string, unknown>).map(readCount);
    droppedTotal = counts.every((count) => count !== null) ? counts.reduce<number>((sum, count) => sum + (count ?? 0), 0) : null;
  }
  return {
    inserted: readCount(record.segmentsInserted),
    superseded: readCount(record.supersededSuggestions),
    dropped: droppedTotal,
    confirmedDuplicates: readCount(record.skippedConfirmedDuplicates),
  };
}

export interface SuggestionLabelSummary {
  /** Compact table text, e.g. "全部 5 类" or "混剪口播、实拍内容 等 4 类". */
  short: string;
  /** Every candidate label name, for tooltips and confirmations. */
  full: string;
}

/** Candidate label keys of a job, in the order the API returns (preset order). */
export function describeSuggestionLabels(
  labelKeys: readonly string[],
  preset: StudioSegmentPreset | undefined,
): SuggestionLabelSummary {
  if (labelKeys.length === 0) return { short: '--', full: '--' };
  const names = labelKeys.map((key) => labelName(preset, key));
  const full = names.join('、');
  const coversPreset =
    preset !== undefined && preset.labels.length === labelKeys.length && preset.labels.every((label) => labelKeys.includes(label.key));
  if (coversPreset) return { short: `全部 ${names.length} 类`, full };
  if (names.length <= 2) return { short: full, full };
  return { short: `${names.slice(0, 2).join('、')} 等 ${names.length} 类`, full };
}

/**
 * Newest job per original first (the API lists newest first); every older job
 * of the same original is history, so a failure that was re-run successfully
 * no longer reads as the current state.
 */
export function splitLatestSuggestionJobs<T extends Pick<StudioSegmentSuggestionJob, 'assetId'>>(
  jobs: readonly T[],
): { latest: T[]; history: T[] } {
  const seen = new Set<string>();
  const latest: T[] = [];
  const history: T[] = [];
  for (const job of jobs) {
    if (seen.has(job.assetId)) history.push(job);
    else {
      seen.add(job.assetId);
      latest.push(job);
    }
  }
  return { latest, history };
}

const FAILURE_TEXT: Record<string, string> = {
  provider_error: '模型没有返回结果，可重新发起（这次调用可能已计费）',
  lease_expired: '分析被中断，可重新发起（这次调用可能已计费）',
};

/** Plain-language failure for the job list; the raw message stays available as detail. */
export function suggestionFailureText(
  job: Pick<StudioSegmentSuggestionJob, 'errorCode' | 'errorMessage'>,
): { text: string; detail: string | null } {
  const mapped = job.errorCode ? FAILURE_TEXT[job.errorCode] : undefined;
  if (mapped) return { text: mapped, detail: job.errorMessage || null };
  return { text: job.errorMessage || '任务未完成', detail: null };
}

/** Only ready raw assets the user can edit and whose content hash is known can be analysed. */
/** Open studio access (`capabilities.openAccess`) does not require the asset edit permission. */
export function isSuggestableAsset(
  asset: Pick<ContentAssetItem, 'canEdit' | 'rawSha256' | 'externalOnly' | 'assetStatus'>,
  openAccess = false,
): boolean {
  return (openAccess || asset.canEdit) && Boolean(asset.rawSha256) && !asset.externalOnly && asset.assetStatus === 'ready';
}

/** `segment-suggest-v4` → `v4`; the prompt generation is separate from the label-set (preset) version. */
export function suggestionPromptLabel(promptVersion: string | null | undefined): string | null {
  if (!promptVersion) return null;
  const match = /-(v\d+)$/.exec(promptVersion.trim());
  return match ? match[1] : promptVersion.trim();
}
