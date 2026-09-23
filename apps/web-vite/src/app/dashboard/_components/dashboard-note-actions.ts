import type { NoteMetricKey, QueryPlatform } from './dashboard-config';
import type { DashboardCreateNotePayload, DashboardUpdateNotePayload } from './dashboard-fetchers';

export interface DashboardNoteDraftInput {
  actionText: string;
  reasonText: string;
  summaryText: string;
}

export interface DashboardNoteDraftValues {
  actionText: string;
  reasonText: string;
  summaryText: string;
}

export type DashboardNoteDraftValidationResult =
  | {
      ok: true;
      values: DashboardNoteDraftValues;
    }
  | {
      ok: false;
      message: string;
    };

export function validateDashboardNoteDraft(
  input: DashboardNoteDraftInput,
  maxLength: number
): DashboardNoteDraftValidationResult {
  const actionText = input.actionText.trim();
  const reasonText = input.reasonText.trim();
  const summaryText = input.summaryText.trim();

  if (!actionText) {
    return { ok: false, message: '请输入动作。' };
  }
  if (actionText.length > maxLength) {
    return { ok: false, message: `动作不能超过 ${maxLength} 个字符。` };
  }
  if (!reasonText) {
    return { ok: false, message: '请输入原因。' };
  }
  if (reasonText.length > maxLength) {
    return { ok: false, message: `原因不能超过 ${maxLength} 个字符。` };
  }
  if (!summaryText) {
    return { ok: false, message: '请输入说明。' };
  }
  if (summaryText.length > maxLength) {
    return { ok: false, message: `说明不能超过 ${maxLength} 个字符。` };
  }

  return {
    ok: true,
    values: {
      actionText,
      reasonText,
      summaryText,
    },
  };
}

export function buildCreateNotePayload(args: {
  noteDate: string;
  platform: QueryPlatform;
  metricKey: NoteMetricKey;
  values: DashboardNoteDraftValues;
}): DashboardCreateNotePayload {
  return {
    noteDate: args.noteDate,
    platform: args.platform,
    metricKey: args.metricKey,
    ...args.values,
  };
}

export function buildUpdateNotePayload(args: {
  metricKey: NoteMetricKey;
  values: DashboardNoteDraftValues;
}): DashboardUpdateNotePayload {
  return {
    metricKey: args.metricKey,
    ...args.values,
  };
}

export function resolveDashboardNoteMetricKey(
  metricKey: string | null | undefined,
  options: readonly { value: NoteMetricKey }[],
  fallback: NoteMetricKey = 'gmv'
): NoteMetricKey {
  return options.some((item) => item.value === metricKey) ? (metricKey as NoteMetricKey) : fallback;
}
