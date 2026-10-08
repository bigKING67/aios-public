import type { BadgeStatus } from '@/components/atoms/badge';
import type { StudioContentSegment, StudioSegmentOrigin, StudioSegmentPreset, StudioSegmentStatus } from './ai-studio-api';

export const SEGMENT_STATUS_OPTIONS: ReadonlyArray<{ value: StudioSegmentStatus; label: string; tone: BadgeStatus }> = [
  { value: 'suggested', label: '待确认', tone: 'warning' },
  { value: 'confirmed', label: '已确认', tone: 'success' },
  { value: 'rejected', label: '已拒绝', tone: 'neutral' },
  { value: 'stale', label: '原片已变化', tone: 'danger' },
];

export function segmentStatusView(status: string): { label: string; tone: BadgeStatus } {
  return SEGMENT_STATUS_OPTIONS.find((option) => option.value === status) ?? { label: status, tone: 'neutral' };
}

export const SEGMENT_ORIGIN_OPTIONS: ReadonlyArray<{ value: StudioSegmentOrigin; label: string }> = [
  { value: 'ai', label: 'AI' },
  { value: 'human', label: '人工' },
];

export function segmentOriginLabel(origin: string): string {
  return SEGMENT_ORIGIN_OPTIONS.find((option) => option.value === origin)?.label ?? origin;
}

/**
 * "框架 · v1". Seed names may already end with their version ("框架 v1"), so a
 * trailing version token matching the preset version is not repeated.
 */
export function presetDisplayName(preset: Pick<StudioSegmentPreset, 'name' | 'version'>): string {
  const suffix = new RegExp(`\\s+v${preset.version}$`, 'i');
  const base = preset.name.trim().replace(suffix, '').trim() || preset.name.trim();
  return `${base} · v${preset.version}`;
}

/** Stale rows and rows whose source hash moved are read-only everywhere. */
export function isSegmentReadOnly(segment: Pick<StudioContentSegment, 'status' | 'sourceCurrent'>): boolean {
  return segment.status === 'stale' || !segment.sourceCurrent;
}

export const DEFAULT_PRESET_KEY = 'framework';

/** Prefers the default key, then the highest active version. */
export function pickDefaultPreset(presets: readonly StudioSegmentPreset[]): StudioSegmentPreset | null {
  const active = presets.filter((preset) => preset.status === 'active');
  const pool = active.length > 0 ? active : presets;
  const sorted = [...pool].sort((a, b) => b.version - a.version);
  return sorted.find((preset) => preset.presetKey === DEFAULT_PRESET_KEY) ?? sorted[0] ?? null;
}

export function findPreset(
  presets: readonly StudioSegmentPreset[],
  presetKey: string,
  version?: number,
): StudioSegmentPreset | undefined {
  return presets.find((preset) => preset.presetKey === presetKey && (version === undefined || preset.version === version));
}

export function labelName(preset: StudioSegmentPreset | undefined, labelKey: string): string {
  return preset?.labels.find((label) => label.key === labelKey)?.name ?? labelKey;
}

/**
 * Chart series tokens in label order, chosen so any five consecutive labels
 * are mutually distinguishable. Series 3 is omitted because it is nearly the
 * same cobalt as series 1 (CIEDE2000 ≈ 3); the closest remaining pair
 * (series 1 / 5) is ≈ 11.
 */
export const LABEL_TONE_SERIES = [1, 6, 2, 5, 4] as const;
export type LabelToneSeries = (typeof LABEL_TONE_SERIES)[number] | 'muted';

/** Stable chart-series tone per label position; unknown labels are muted. Label text always accompanies the color. */
export function labelToneSeries(preset: StudioSegmentPreset | undefined, labelKey: string): LabelToneSeries {
  const index = preset?.labels.findIndex((label) => label.key === labelKey) ?? -1;
  return index >= 0 ? LABEL_TONE_SERIES[index % LABEL_TONE_SERIES.length] : 'muted';
}

export interface AiSegmentEvidence {
  /** 0–1 model self-reported confidence; a model claim, not a probability. */
  confidence: number | null;
  reason: string;
}

/**
 * Model observation stored on AI segments. Returns null for human segments or
 * evidence without either field, so the UI never shows an invented value.
 */
export function readAiSegmentEvidence(segment: Pick<StudioContentSegment, 'origin' | 'evidence'>): AiSegmentEvidence | null {
  if (segment.origin !== 'ai') return null;
  const evidence = segment.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  const record = evidence as Record<string, unknown>;
  const raw = record.confidence;
  const confidence = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
  return confidence === null && !reason ? null : { confidence, reason };
}
