import type { StudioContentSegment, StudioSegmentPreset } from './ai-studio-api';
import type { StudioRemixBatchSegment, StudioRemixEditCheckRequest } from './remix-api';

/** AI 剪辑 page purpose in single mode. */
export const SINGLE_EDIT_PURPOSE = '单条剪辑：从一个起点出发，在剪辑台上调顺序、修剪、替换片段，满意后出一条成片。';

/** Mirrors the server's 单条剪辑 limits (`remix_edit.rs`). */
export const MAX_EDIT_CLIPS = 50;
export const MIN_EDIT_CLIP_MS = 1_000;
export const MIN_EDIT_TOTAL_MS = 3_000;
/** Trim handles move in 0.1 s steps. */
export const EDIT_TRIM_STEP_MS = 100;

/** One clip on the 剪辑台: a confirmed segment trimmed inside its own bounds. */
export interface EditClip {
  /** Client-only identity, so the same segment can sit on the timeline twice. */
  key: string;
  segmentId: string;
  startMs: number;
  endMs: number;
}

/** The fields of a confirmed segment the 剪辑台 reads. */
export type EditSegment = Pick<
  StudioContentSegment,
  'segmentId' | 'assetId' | 'assetTitle' | 'labelKey' | 'startMs' | 'endMs' | 'coverUrl' | 'productName' | 'presetVersion' | 'sourceCurrent'
>;

let clipCounter = 0;

export function newClipKey(): string {
  clipCounter += 1;
  return `clip-${Date.now().toString(36)}-${clipCounter}`;
}

export function clipFromSegment(segment: Pick<EditSegment, 'segmentId' | 'startMs' | 'endMs'>): EditClip {
  return { key: newClipKey(), segmentId: segment.segmentId, startMs: segment.startMs, endMs: segment.endMs };
}

/** Segments the 剪辑台 may use: current confirmed segments of this preset version. */
export function usableEditSegments<T extends EditSegment>(segments: readonly T[], presetVersion: number): T[] {
  return segments.filter((segment) => segment.sourceCurrent && segment.presetVersion === presetVersion);
}

export function editTotalMs(clips: readonly Pick<EditClip, 'startMs' | 'endMs'>[]): number {
  return clips.reduce((sum, clip) => sum + Math.max(0, clip.endMs - clip.startMs), 0);
}

export function moveClip(clips: readonly EditClip[], index: number, delta: -1 | 1): EditClip[] {
  const target = index + delta;
  if (index < 0 || index >= clips.length || target < 0 || target >= clips.length) return [...clips];
  const next = [...clips];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Replaces a clip with another whole segment, keeping its place (and key) on the timeline. */
export function replaceClip(clips: readonly EditClip[], key: string, segment: Pick<EditSegment, 'segmentId' | 'startMs' | 'endMs'>): EditClip[] {
  return clips.map((clip) =>
    clip.key === key ? { key, segmentId: segment.segmentId, startMs: segment.startMs, endMs: segment.endMs } : clip,
  );
}

/**
 * Trims a clip inside its segment: the range is clamped to the segment and kept
 * at least 1 s long (the moved handle yields when the segment is long enough).
 */
export function trimClip(
  clip: EditClip,
  segment: Pick<EditSegment, 'startMs' | 'endMs'>,
  range: readonly [number, number],
): EditClip {
  let start = Math.max(segment.startMs, Math.min(range[0], segment.endMs));
  let end = Math.max(segment.startMs, Math.min(range[1], segment.endMs));
  if (end - start < MIN_EDIT_CLIP_MS) {
    if (start !== clip.startMs) start = Math.max(segment.startMs, end - MIN_EDIT_CLIP_MS);
    else end = Math.min(segment.endMs, start + MIN_EDIT_CLIP_MS);
    if (end - start < MIN_EDIT_CLIP_MS) start = Math.max(segment.startMs, end - MIN_EDIT_CLIP_MS);
  }
  return { ...clip, startMs: start, endMs: end };
}

export function isClipTrimmed(clip: Pick<EditClip, 'startMs' | 'endMs'>, segment: Pick<EditSegment, 'startMs' | 'endMs'>): boolean {
  return clip.startMs !== segment.startMs || clip.endMs !== segment.endMs;
}

/** The product of an edit: its first clip whose segment is known. */
export function editProduct(clips: readonly EditClip[], segments: ReadonlyMap<string, EditSegment>): string | null {
  for (const clip of clips) {
    const product = segments.get(clip.segmentId)?.productName?.trim();
    if (product) return product;
  }
  return null;
}

/** Why the edit cannot be generated yet, or null when it can be checked and created. */
export function editBlocker(
  clips: readonly EditClip[],
  segments: ReadonlyMap<string, EditSegment>,
  maxSeconds: number,
): string | null {
  if (clips.length === 0) return '先选一个起点，或从片段库添加片段。';
  const missing = clips.filter((clip) => !segments.has(clip.segmentId)).length;
  if (missing > 0) return `${missing} 段已不可用（取消确认或原片更新），请删除或替换。`;
  const products = new Set(clips.map((clip) => segments.get(clip.segmentId)?.productName?.trim() || ''));
  if (products.has('')) return '有片段没有标注产品，请先在片段素材里补全产品或替换。';
  if (products.size > 1) return '一条成片只能使用同一产品的片段。';
  if (clips.length > MAX_EDIT_CLIPS) return `一条成片最多 ${MAX_EDIT_CLIPS} 段。`;
  if (clips.some((clip) => clip.endMs - clip.startMs < MIN_EDIT_CLIP_MS)) return '每段至少 1 秒。';
  const total = editTotalMs(clips);
  if (total < MIN_EDIT_TOTAL_MS) return '成片至少 3 秒。';
  if (total > maxSeconds * 1000) return `成片最长 ${maxSeconds} 秒，请删减或修剪。`;
  return null;
}

export function buildEditCheckRequest(
  preset: Pick<StudioSegmentPreset, 'presetKey' | 'version'>,
  clips: readonly EditClip[],
): StudioRemixEditCheckRequest {
  return {
    presetKey: preset.presetKey,
    presetVersion: preset.version,
    clips: clips.map(({ segmentId, startMs, endMs }) => ({ segmentId, startMs, endMs })),
  };
}

/** 起点 A: an existing output's segments, in playback order with their cuts. */
export function clipsFromOutput(segments: readonly Pick<StudioRemixBatchSegment, 'segmentId' | 'startMs' | 'endMs'>[]): EditClip[] {
  return segments.map(clipFromSegment);
}

/**
 * 起点 B: one original's usable segments in time order. Segments of another
 * product than the original's main one are left out, since one output keeps
 * one product.
 */
export function clipsFromOriginal(segments: readonly EditSegment[], assetId: string): EditClip[] {
  const own = segments.filter((segment) => segment.assetId === assetId).sort((a, b) => a.startMs - b.startMs);
  const counts = new Map<string, number>();
  for (const segment of own) {
    const product = segment.productName?.trim();
    if (product) counts.set(product, (counts.get(product) ?? 0) + 1);
  }
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return own.filter((segment) => !main || segment.productName?.trim() === main).map(clipFromSegment);
}

/** Exact repeat refused by the server unless `allowDuplicate`. */
export const REMIX_EDIT_DUPLICATE_CODE = 'remix_edit_duplicate';

/**
 * Browser-local draft of the 剪辑台, one per signed-in user and preset version,
 * so switching presets never discards another preset's draft. Older layouts
 * (v1 shared by every account, v2 one per user) are discarded.
 */
const LEGACY_DRAFT_KEY = 'aiStudio.singleEditDraft.v1';

function draftKey(owner: string, preset: Pick<StudioSegmentPreset, 'presetKey' | 'version'>): string {
  return `aiStudio.singleEditDraft.v3:${owner}:${preset.presetKey}:${preset.version}`;
}

interface EditDraft {
  presetKey: string;
  presetVersion: number;
  clips: Omit<EditClip, 'key'>[];
}

function isDraftClip(value: unknown): value is Omit<EditClip, 'key'> {
  if (!value || typeof value !== 'object') return false;
  const clip = value as Record<string, unknown>;
  return (
    typeof clip.segmentId === 'string' &&
    Number.isInteger(clip.startMs) &&
    Number.isInteger(clip.endMs) &&
    (clip.endMs as number) > (clip.startMs as number)
  );
}

/** `owner` null (signed-out or unknown user) keeps no draft at all. */
export function loadEditDraft(
  preset: Pick<StudioSegmentPreset, 'presetKey' | 'version'>,
  owner: string | null,
  storage: Storage | null,
): EditClip[] {
  try {
    storage?.removeItem(LEGACY_DRAFT_KEY);
    if (!owner) return [];
    storage?.removeItem(`aiStudio.singleEditDraft.v2:${owner}`);
    const raw = storage?.getItem(draftKey(owner, preset));
    if (!raw) return [];
    const draft = JSON.parse(raw) as Partial<EditDraft>;
    if (draft.presetKey !== preset.presetKey || draft.presetVersion !== preset.version || !Array.isArray(draft.clips)) return [];
    return draft.clips.filter(isDraftClip).slice(0, MAX_EDIT_CLIPS).map(clipFromSegment);
  } catch {
    return [];
  }
}

export function saveEditDraft(
  preset: Pick<StudioSegmentPreset, 'presetKey' | 'version'>,
  owner: string | null,
  clips: readonly EditClip[],
  storage: Storage | null,
): void {
  if (!owner) return;
  try {
    if (clips.length === 0) {
      storage?.removeItem(draftKey(owner, preset));
      return;
    }
    const draft: EditDraft = {
      presetKey: preset.presetKey,
      presetVersion: preset.version,
      clips: clips.map(({ segmentId, startMs, endMs }) => ({ segmentId, startMs, endMs })),
    };
    storage?.setItem(draftKey(owner, preset), JSON.stringify(draft));
  } catch {
    // Private mode or a full quota: the draft is a convenience only.
  }
}
