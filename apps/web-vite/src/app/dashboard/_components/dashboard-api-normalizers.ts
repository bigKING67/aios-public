import type {
  DashboardDailyNoteRow as ApiDashboardDailyNoteRow,
  DashboardDailyNotesResponse as ApiDashboardDailyNotesResponse,
  DashboardDateBoundsResponse as ApiDashboardDateBoundsResponse,
} from '@/lib/generated-api-contract';
import type { QueryPlatform } from './dashboard-config';
import type { DashboardDateBoundsApiResponse } from './dashboard-fetcher-types';
import type {
  DashboardDailyNoteRow,
  DashboardDailyNotesApiResponse,
} from './dashboard-types';

type JsonRecord = Record<string, unknown>;

const NOTE_PLATFORMS = new Set<Exclude<QueryPlatform, 'overview'>>([
  'taobao',
  'douyin',
  'xhs',
  'jd',
  'wx',
]);
const QUERY_PLATFORMS = new Set<QueryPlatform>(['overview', ...NOTE_PLATFORMS]);

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function requiredInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  return value as number;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function notePlatform(value: unknown): Exclude<QueryPlatform, 'overview'> {
  const platform = requiredString(value, 'dashboard note platform');
  if (!NOTE_PLATFORMS.has(platform as Exclude<QueryPlatform, 'overview'>)) {
    throw new Error(`Unsupported dashboard note platform: ${platform}`);
  }
  return platform as Exclude<QueryPlatform, 'overview'>;
}

function queryPlatform(value: unknown): QueryPlatform {
  const platform = requiredString(value, 'dashboard notes platform');
  if (!QUERY_PLATFORMS.has(platform as QueryPlatform)) {
    throw new Error(`Unsupported dashboard notes platform: ${platform}`);
  }
  return platform as QueryPlatform;
}

function normalizeDashboardDailyNote(value: unknown): DashboardDailyNoteRow {
  const row = asRecord(value, 'dashboard note row');
  const normalized = {
    id: requiredInteger(row.id, 'dashboard note id'),
    note_date: requiredString(row.note_date, 'dashboard note date'),
    platform: notePlatform(row.platform),
    metric_key: nullableString(row.metric_key, 'dashboard note metric_key'),
    action_text: requiredString(row.action_text, 'dashboard note action_text'),
    reason_text: requiredString(row.reason_text, 'dashboard note reason_text'),
    summary_text: requiredString(row.summary_text, 'dashboard note summary_text'),
    created_by: requiredString(row.created_by, 'dashboard note created_by'),
    updated_by: requiredString(row.updated_by, 'dashboard note updated_by'),
    created_at: requiredString(row.created_at, 'dashboard note created_at'),
    updated_at: requiredString(row.updated_at, 'dashboard note updated_at'),
  } satisfies ApiDashboardDailyNoteRow;
  return normalized;
}

function normalizeCountsByDate(value: unknown): Record<string, number> {
  const counts = asRecord(value, 'dashboard note countsByDate');
  return Object.fromEntries(Object.entries(counts).map(([date, count]) => {
    const normalizedCount = requiredInteger(count, `dashboard note count for ${date}`);
    if (normalizedCount < 0) {
      throw new Error(`dashboard note count for ${date} must not be negative`);
    }
    return [date, normalizedCount];
  }));
}

export function normalizeDashboardDateBounds(
  value: unknown,
): DashboardDateBoundsApiResponse {
  const response = asRecord(value, 'dashboard date bounds response');
  return {
    minDate: nullableString(response.minDate, 'dashboard date bounds minDate'),
    maxDate: nullableString(response.maxDate, 'dashboard date bounds maxDate'),
  } satisfies ApiDashboardDateBoundsResponse;
}

export function normalizeDashboardNotesResponse(
  value: unknown,
): DashboardDailyNotesApiResponse {
  const response = asRecord(value, 'dashboard notes response');
  const rows = response.rows;
  if (!Array.isArray(rows)) {
    throw new Error('dashboard notes rows must be an array');
  }

  const normalized = {
    startDate: requiredString(response.startDate, 'dashboard notes startDate'),
    endDate: requiredString(response.endDate, 'dashboard notes endDate'),
    platform: queryPlatform(response.platform),
    includeRows: requiredBoolean(response.includeRows, 'dashboard notes includeRows'),
    noteDate: response.noteDate === undefined
      ? undefined
      : requiredString(response.noteDate, 'dashboard notes noteDate'),
    rows: rows.map(normalizeDashboardDailyNote),
    countsByDate: normalizeCountsByDate(response.countsByDate),
  } satisfies ApiDashboardDailyNotesResponse;
  return normalized;
}

export function normalizeDashboardNoteResponse(value: unknown): DashboardDailyNoteRow {
  return normalizeDashboardDailyNote(value);
}
