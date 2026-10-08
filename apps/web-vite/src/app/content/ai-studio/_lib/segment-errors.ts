import { asRecord } from '@/lib/unknown-data';
import type { StudioContentSegmentConflictResponse } from './ai-studio-api';
import { formatSegmentTime } from './segment-time';

export type SegmentMutationErrorKind =
  | 'overlap'
  | 'stale'
  | 'revision'
  | 'permission'
  | 'not_found'
  | 'disabled'
  | 'invalid'
  | 'unknown';

export interface SegmentMutationError {
  kind: SegmentMutationErrorKind;
  message: string;
  /** Segment IDs the server named; the UI highlights the ones it can see. */
  segmentIds: string[];
}

interface SegmentLookupItem {
  segmentId: string;
  startMs: number;
  endMs: number;
  labelName: string;
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { statusCode?: unknown; status?: unknown };
  if (typeof record.statusCode === 'number') return record.statusCode;
  if (typeof record.status === 'number') return record.status;
  return undefined;
}

type ConflictKind = Extract<SegmentMutationErrorKind, 'overlap' | 'stale' | 'revision'>;

/** Server `code` values of the studio 409 body (see ContentSegmentConflictResponse). */
const CONFLICT_CODE_KINDS: Readonly<Record<string, ConflictKind>> = {
  segment_overlap: 'overlap',
  batch_overlap: 'overlap',
  source_changed: 'stale',
  stale_segment: 'stale',
  revision_conflict: 'revision',
};

/**
 * Text markers of older backends without `code`: a batch confirm whose own
 * segments overlap, and a create whose source changed (nothing was marked yet).
 */
const BATCH_OVERLAP_TEXT = '所选片段之间';
const SOURCE_CHANGED_TEXT = '原片已变化，请刷新后重新标注';

function fallbackCode(message: string): string {
  if (message.includes(BATCH_OVERLAP_TEXT)) return 'batch_overlap';
  if (message.includes('重叠')) return 'segment_overlap';
  if (message.includes(SOURCE_CHANGED_TEXT)) return 'source_changed';
  if (message.includes('原片已变化')) return 'stale_segment';
  return 'revision_conflict';
}

/**
 * Reads the structured 409 body from the transport error. Returns null for
 * older backends (text-only `detail`) or malformed bodies so callers fall back
 * to text parsing.
 */
function readStructuredConflict(error: unknown): { code: string; segmentIds: string[] } | null {
  const conflict = readStudioConflict(error);
  return conflict && CONFLICT_CODE_KINDS[conflict.code] ? conflict : null;
}

/** Any studio 409 body (`code` + `segmentIds`), or null for other errors and malformed bodies. */
export function readStudioConflict(error: unknown): { code: string; segmentIds: string[] } | null {
  if (readStatus(error) !== 409) return null;
  const body = asRecord(asRecord(asRecord(asRecord(error)?.originalError)?.response)?.data);
  if (!body) return null;
  const code = (body as Partial<StudioContentSegmentConflictResponse>).code;
  const ids = (body as Partial<StudioContentSegmentConflictResponse>).segmentIds;
  if (typeof code !== 'string') return null;
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) return null;
  return { code, segmentIds: Array.from(new Set(ids.map((id) => id.toLowerCase()))) };
}

function readMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return '';
}

function describeSegments(ids: string[], lookup: readonly SegmentLookupItem[]): string {
  const known = ids
    .map((id) => lookup.find((item) => item.segmentId === id))
    .filter((item): item is SegmentLookupItem => Boolean(item))
    .map((item) => `${item.labelName} ${formatSegmentTime(item.startMs)}–${formatSegmentTime(item.endMs)}`);
  if (known.length === 0) return '';
  return `（${known.join('、')}）`;
}

/**
 * Maps a studio write failure onto an actionable message. A 409 prefers the
 * structured `code`/`segmentIds`; without them (older backend) the kind and
 * IDs are parsed from the detail text.
 */
export function describeSegmentMutationError(
  error: unknown,
  lookup: readonly SegmentLookupItem[] = [],
): SegmentMutationError {
  const status = readStatus(error);
  const message = readMessage(error);
  const structured = status === 409 ? readStructuredConflict(error) : null;
  const segmentIds = structured?.segmentIds
    ?? Array.from(new Set((message.match(UUID_PATTERN) ?? []).map((id) => id.toLowerCase())));

  if (status === 409) {
    const code = structured?.code ?? fallbackCode(message);
    const kind = CONFLICT_CODE_KINDS[code] ?? 'revision';
    if (code === 'batch_overlap') {
      const known = describeSegments(segmentIds, lookup);
      return {
        kind: 'overlap',
        segmentIds,
        message: `所选片段之间时间重叠${known}。请只勾选其中一条确认，或先调整边界。`,
      };
    }
    if (kind === 'overlap') {
      const known = describeSegments(segmentIds, lookup);
      return {
        kind: 'overlap',
        segmentIds,
        message: known
          ? `与已确认片段时间重叠${known}。请调整边界，或先把冲突片段改回待确认。`
          : '与已确认片段时间重叠，冲突片段可能不在当前列表中。请刷新后调整边界。',
      };
    }
    if (code === 'source_changed') {
      return { kind: 'stale', segmentIds, message: '原片内容已变化，请刷新后按新原片标注。' };
    }
    if (kind === 'stale') {
      return {
        kind: 'stale',
        segmentIds,
        message: '原片内容已变化，旧片段已标记为过期且只读。请刷新后按新原片重新标注。',
      };
    }
    return {
      kind: 'revision',
      segmentIds,
      message: '片段已被其他人或其他页面修改。请刷新后基于最新版本重试。',
    };
  }
  if (status === 403) {
    return { kind: 'permission', segmentIds, message: '没有该原片的编辑权限，不能修改它的片段。' };
  }
  if (status === 404) {
    return { kind: 'not_found', segmentIds, message: '原片或片段不存在，可能已被删除。请刷新列表。' };
  }
  if (status === 503) {
    return { kind: 'disabled', segmentIds, message: message || 'AI 创作中心尚未启用。' };
  }
  if (status === 400) {
    return { kind: 'invalid', segmentIds, message: message || '片段参数不合法，请检查起止时间与标签。' };
  }
  return { kind: 'unknown', segmentIds, message: message || '保存失败，请稍后重试。' };
}
