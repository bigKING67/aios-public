import type { StudioContentSegment, StudioUpdateContentSegmentRequest } from './ai-studio-api';
import { formatSegmentTime, parseSegmentTime } from './segment-time';

export interface SegmentDraftInput {
  startText: string;
  endText: string;
  labelKey: string;
  /** Known source duration; null when the asset duration is unverified. */
  durationMs: number | null;
  /**
   * Existing interval when editing. Text shown at tenth precision maps back to
   * the stored millisecond value unless the user changed it, so an untouched
   * boundary is never silently rounded.
   */
  original?: { startMs: number; endMs: number };
}

function resolveTime(text: string, originalMs: number | undefined): number | null {
  if (originalMs !== undefined && text.trim() === formatSegmentTime(originalMs)) return originalMs;
  return parseSegmentTime(text);
}

export interface SegmentDraftErrors {
  start?: string;
  end?: string;
  label?: string;
}

export type SegmentDraftValidation =
  | { ok: true; startMs: number; endMs: number }
  | { ok: false; errors: SegmentDraftErrors };

/** Minimum segment length the form accepts; shorter cuts are almost always mis-clicks. */
export const MIN_SEGMENT_MS = 500;

export function validateSegmentDraft(input: SegmentDraftInput): SegmentDraftValidation {
  const errors: SegmentDraftErrors = {};
  const startMs = resolveTime(input.startText, input.original?.startMs);
  const endMs = resolveTime(input.endText, input.original?.endMs);
  if (startMs === null) errors.start = '请输入入点，例如 0:12.5';
  if (endMs === null) errors.end = '请输入出点，例如 0:18.0';
  if (!input.labelKey) errors.label = '请选择标签';
  if (startMs !== null && endMs !== null) {
    if (endMs <= startMs) {
      errors.end = '出点必须晚于入点';
    } else if (endMs - startMs < MIN_SEGMENT_MS) {
      errors.end = '片段至少 0.5 秒';
    }
  }
  if (input.durationMs !== null && endMs !== null && endMs > input.durationMs) {
    errors.end = '出点超过原片时长';
  }
  if (input.durationMs !== null && startMs !== null && startMs >= input.durationMs) {
    errors.start = '入点超过原片时长';
  }
  if (Object.keys(errors).length > 0 || startMs === null || endMs === null) {
    return { ok: false, errors };
  }
  return { ok: true, startMs, endMs };
}

/** Sends only changed fields plus `expectedRevision`; a blank product clears it. */
export function buildSegmentPatch(
  segment: StudioContentSegment,
  next: { startMs: number; endMs: number; labelKey: string; productName: string },
): StudioUpdateContentSegmentRequest | null {
  const request: StudioUpdateContentSegmentRequest = { expectedRevision: segment.revision };
  if (next.startMs !== segment.startMs) request.startMs = next.startMs;
  if (next.endMs !== segment.endMs) request.endMs = next.endMs;
  if (next.labelKey !== segment.labelKey) request.labelKey = next.labelKey;
  const product = next.productName.trim();
  if (product !== (segment.productName ?? '')) request.productName = product;
  return Object.keys(request).length > 1 ? request : null;
}
