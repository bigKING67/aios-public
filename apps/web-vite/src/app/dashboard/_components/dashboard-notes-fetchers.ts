import { request } from '@/lib/request';
import {
  AIOS_API_PATHS,
  type DashboardCreateNoteRequest,
  type DashboardUpdateNoteRequest,
} from '@/lib/generated-api-contract';
import type {
  DashboardDailyNoteRow,
  DashboardDailyNotesApiResponse,
} from './dashboard-types';
import type {
  DashboardCreateNotePayload,
  DashboardFetchOptions,
  DashboardNotesForDateQueryParams,
  DashboardRangeQueryParams,
  DashboardUpdateNotePayload,
} from './dashboard-fetcher-types';
import {
  normalizeDashboardNoteResponse,
  normalizeDashboardNotesResponse,
} from './dashboard-api-normalizers';

function noteWritePlatform(
  platform: DashboardCreateNotePayload['platform'],
): DashboardCreateNoteRequest['platform'] {
  if (platform === 'overview') {
    throw new Error('Dashboard notes require a concrete platform');
  }
  return platform;
}

export async function fetchDashboardNoteCounts(
  params: DashboardRangeQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardDailyNotesApiResponse> {
  const response = await request.get<unknown>(AIOS_API_PATHS.dashboardNotes, {
    params: {
      start_date: params.startDate,
      end_date: params.endDate,
      platform: params.platform,
      include_rows: '0',
    },
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
  return normalizeDashboardNotesResponse(response);
}

export async function fetchDashboardNotesForDate(
  params: DashboardNotesForDateQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardDailyNotesApiResponse> {
  const response = await request.get<unknown>(AIOS_API_PATHS.dashboardNotes, {
    params: {
      start_date: params.noteDate,
      end_date: params.noteDate,
      platform: params.platform,
      note_date: params.noteDate,
    },
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
  return normalizeDashboardNotesResponse(response);
}

export async function createDashboardNote(
  payload: DashboardCreateNotePayload
): Promise<DashboardDailyNoteRow> {
  const requestBody = {
      note_date: payload.noteDate,
      platform: noteWritePlatform(payload.platform),
      metric_key: payload.metricKey,
      action_text: payload.actionText,
      reason_text: payload.reasonText,
      summary_text: payload.summaryText,
  } satisfies DashboardCreateNoteRequest;
  const response = await request.post<unknown>(
    AIOS_API_PATHS.dashboardNotes,
    requestBody,
    {
      requestKey: 'dashboard-notes-create',
      cancelPrevious: true,
      retryMode: 'never',
    }
  );
  return normalizeDashboardNoteResponse(response);
}

export async function updateDashboardNote(
  noteId: number,
  payload: DashboardUpdateNotePayload
): Promise<DashboardDailyNoteRow> {
  const requestBody = {
      metric_key: payload.metricKey,
      action_text: payload.actionText,
      reason_text: payload.reasonText,
      summary_text: payload.summaryText,
  } satisfies DashboardUpdateNoteRequest;
  const response = await request.patch<unknown>(
    AIOS_API_PATHS.dashboardNote(noteId),
    requestBody,
    {
      requestKey: 'dashboard-notes-update',
      cancelPrevious: true,
      retryMode: 'never',
    }
  );
  return normalizeDashboardNoteResponse(response);
}

export function deleteDashboardNote(noteId: number): Promise<void> {
  return request.delete<void>(AIOS_API_PATHS.dashboardNote(noteId), {
    requestKey: 'dashboard-notes-delete',
    cancelPrevious: true,
    retryMode: 'never',
  });
}
