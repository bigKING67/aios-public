import type { WeeklySummaryAIScope } from '@/config/weekly-summary-ai';
import type { WeeklySummaryConclusionsInput } from '@/lib/api';

export type SummaryContentStatus = 'AI_DRAFT' | 'MANUAL_EDITED' | 'APPROVED' | 'PUBLISHED';

export interface SummaryData {
  status: 'PENDING' | 'GENERATING' | 'SUCCESS' | 'FAILED' | 'NONE';
  summary_scope?: string;
  content_status?: SummaryContentStatus;
  generated_at?: string;
  provider?: string;
  model?: string;
  updated_by?: string;
  approved_by?: string;
  approved_at?: string;
  published_by?: string;
  published_at?: string;
  conclusions?: {
    overall: string;
    highlights: string[];
    risks: string[];
    type?: 'auto_calculated' | 'ai_generated';
  };
  error_message?: string;
}

export interface SummaryStatusResponse {
  status?: string;
  summary_scope?: string | null;
  content_status?: string | null;
  generated_at?: string | null;
  error_msg?: string | null;
  provider?: string | null;
  model?: string | null;
  updated_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  published_by?: string | null;
  published_at?: string | null;
}

export interface SummaryContentResponse {
  summary_scope?: string | null;
  content_status?: string | null;
  conclusions?: SummaryData['conclusions'];
  provider?: string | null;
  model?: string | null;
  generated_at?: string | null;
  updated_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  published_by?: string | null;
  published_at?: string | null;
}

export interface APIErrorLike extends Error {
  code?: string;
}

export interface MutationContext {
  previousData?: SummaryData;
}

export interface UpdateSummaryVariables {
  conclusions: WeeklySummaryConclusionsInput;
}

export interface GenerateSummaryVariables {
  forceRegenerate?: boolean;
}

export interface GenerateSummaryResponse {
  queued?: boolean;
  status?: string;
  message?: string;
}

const SUMMARY_STATUS_MAP: Record<string, SummaryData['status']> = {
  PENDING: 'PENDING',
  GENERATING: 'GENERATING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  RETRY_PENDING: 'GENERATING',
};

export function resolveRequestedSummaryScope(
  scope?: WeeklySummaryAIScope
): WeeklySummaryAIScope {
  if (scope === 'overview' || scope === 'tmall' || scope === 'global') {
    return scope;
  }
  return 'global';
}

export function normalizeResponseSummaryScope(
  value?: string | null
): WeeklySummaryAIScope | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'overview' || normalized === 'tmall' || normalized === 'global') {
    return normalized as WeeklySummaryAIScope;
  }

  return undefined;
}

export function isSummaryScopeMatched(
  requestedScope: WeeklySummaryAIScope,
  actualScope?: WeeklySummaryAIScope
): boolean {
  if (requestedScope === 'global') {
    return !actualScope || actualScope === 'global';
  }

  return actualScope === requestedScope;
}

export function buildEmptySummaryByScope(scope: WeeklySummaryAIScope): SummaryData {
  return {
    status: 'NONE',
    summary_scope: scope,
    conclusions: undefined,
    content_status: undefined,
    generated_at: undefined,
    provider: undefined,
    model: undefined,
    updated_by: undefined,
    approved_by: undefined,
    approved_at: undefined,
    published_by: undefined,
    published_at: undefined,
    error_message: undefined,
  };
}

export function buildWeeklySummaryQueryKey(
  reportId: string,
  weekPeriod?: string,
  summaryScope?: WeeklySummaryAIScope
) {
  const scope = summaryScope || 'global';

  if (weekPeriod) {
    return ['weekly-summary', reportId, weekPeriod, scope] as const;
  }

  return ['weekly-summary', reportId, scope] as const;
}

export function normalizeSummaryStatus(status?: string): SummaryData['status'] {
  if (!status) {
    return 'NONE';
  }

  return SUMMARY_STATUS_MAP[status] || 'NONE';
}

export function normalizeGeneratedAt(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  return value;
}

export function normalizeSummaryContentStatus(
  value?: string | null
): SummaryContentStatus | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === 'AI_DRAFT' ||
    normalized === 'MANUAL_EDITED' ||
    normalized === 'APPROVED' ||
    normalized === 'PUBLISHED'
  ) {
    return normalized as SummaryContentStatus;
  }

  return undefined;
}

export function mapSummaryMeta(data?: SummaryStatusResponse | SummaryContentResponse): Pick<
  SummaryData,
  | 'summary_scope'
  | 'content_status'
  | 'updated_by'
  | 'approved_by'
  | 'approved_at'
  | 'published_by'
  | 'published_at'
> {
  return {
    summary_scope:
      typeof data?.summary_scope === 'string' && data.summary_scope
        ? data.summary_scope
        : undefined,
    content_status: normalizeSummaryContentStatus(data?.content_status),
    updated_by:
      typeof data?.updated_by === 'string' && data.updated_by
        ? data.updated_by
        : undefined,
    approved_by:
      typeof data?.approved_by === 'string' && data.approved_by
        ? data.approved_by
        : undefined,
    approved_at: normalizeGeneratedAt(data?.approved_at),
    published_by:
      typeof data?.published_by === 'string' && data.published_by
        ? data.published_by
        : undefined,
    published_at: normalizeGeneratedAt(data?.published_at),
  };
}
