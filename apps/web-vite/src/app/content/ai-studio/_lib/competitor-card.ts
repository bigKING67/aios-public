/**
 * Card A (competitor-card-a) read model. The card is stored as JSON written by
 * the competitor worker; every reader here is defensive so an older or partial
 * card renders what it has instead of failing. Display names come from the
 * card's own `labels` (the taxonomy of the version that produced it).
 */

type JsonRecord = Record<string, unknown>;

export type CardLabels = Record<string, Record<string, string>>;

export interface CardEvidence {
  id: string;
  modality: string;
  startSec: number | null;
  endSec: number | null;
  content: string;
  quality: string;
}

export interface CardSegment {
  id: string;
  startSec: number;
  endSec: number;
  primaryRole: string;
  secondaryRoles: string[];
  contentForms: string[];
  voiceForm: string | null;
  tone: string | null;
  music: string | null;
  sfx: string[];
  summary: string;
  evidenceRefs: string[];
  claimRefs: string[];
}

export interface CardClaim {
  id: string;
  text: string;
  sellingPoint: string;
  qualifiers: string[];
  statedRefs: string[];
  shownRefs: string[];
  evidenceForm: string;
  support: string;
  limitation: string;
}

export interface CardHook {
  assessment: string;
  speech: string | null;
  onscreenText: string | null;
  visual: string;
  mechanismIds: string[];
  audioCues: string[];
  whyKeepWatching: string;
  completeHookEndSec: number | null;
}

export interface CardDimensionLabel {
  text: string;
  /** stated / inferred / shown (audiences and scenes), the trust-cue key otherwise. */
  kind: string;
}

export interface FrameworkSegment {
  startMs: number;
  endMs: number;
  labelKey: string;
}

export interface FrameworkSellingPoint {
  startMs: number;
  endMs: number;
  labelKeys: string[];
  /** Index into `segments`: the 混剪口播 segment the selling point sits in. */
  segmentIndex: number;
  quote: string;
}

export interface TranscriptLine {
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * Framework / selling-point structure in our own preset labels (worker `structure.py`): the same
 * framework v2 and 卖点 text input as AI 切段, plus the full local transcript.
 */
export interface CardFramework {
  /** ok, unavailable (no GPU node) or failed; anything else reads as failed. */
  status: string;
  reason: string;
  /** Set when the transcript failed: the framework segments stand, with no script or selling points. */
  transcriptError: string;
  /** Set when the selling-point call failed: the framework segments and script stand. */
  sellingPointError: string;
  labels: { framework: Record<string, string>; sellingPoint: Record<string, string> };
  /** Preset label order (JSONB does not keep object key order); drives the label tones. */
  labelOrder: { framework: string[]; sellingPoint: string[] };
  segments: FrameworkSegment[];
  sellingPoints: FrameworkSellingPoint[];
  transcript: TranscriptLine[];
}

export interface CompetitorCard {
  analysisStatus: string;
  limitations: string[];
  summary: string;
  purchaseQuestion: string;
  hook: CardHook | null;
  segments: CardSegment[];
  evidence: Map<string, CardEvidence>;
  claims: CardClaim[];
  product: { brand: string | null; name: string | null; category: string | null };
  audiences: { assessment: string; labels: CardDimensionLabel[] } | null;
  scenes: { assessment: string; labels: CardDimensionLabel[] } | null;
  trustCues: { assessment: string; labels: CardDimensionLabel[] } | null;
  offers: { assessment: string; offers: string[]; cta: string[] } | null;
  sound: { assessment: string; summary: string } | null;
  transfer: { methods: string[]; brandDependent: string[]; weNeed: string[] };
  /** Coarse persuasion path from host normalisation (roles in order). */
  path: string[];
  labels: CardLabels;
  /** Null on cards written before the structure step. */
  framework: CardFramework | null;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value: unknown): string | null {
  return text(value) || null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is JsonRecord => item !== null) : [];
}

function stringMap(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value) ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

// The framework preset's order, for structures written before `labelOrder` was stored.
const FRAMEWORK_ORDER = ['mixed_voiceover', 'live_demo', 'street_interview', 'promotion', 'koc'];

function labelOrder(stored: unknown, labels: Record<string, string>, fallback: readonly string[]): string[] {
  const order = texts(stored);
  if (order.length) return order;
  const keys = Object.keys(labels);
  return [...fallback.filter((key) => keys.includes(key)), ...keys.filter((key) => !fallback.includes(key))];
}

function readFramework(value: unknown): CardFramework | null {
  const framework = record(value);
  if (!framework) return null;
  const labels = record(framework.labels);
  const segments = records(framework.segments)
    .map((item) => ({ startMs: num(item.startMs), endMs: num(item.endMs), labelKey: text(item.labelKey) }))
    .filter((item): item is FrameworkSegment => item.startMs !== null && item.endMs !== null && item.endMs > item.startMs && !!item.labelKey)
    .sort((a, b) => a.startMs - b.startMs);
  const sellingPoints = records(framework.sellingPoints)
    .map((item) => ({
      startMs: num(item.startMs),
      endMs: num(item.endMs),
      labelKeys: texts(item.labelKeys),
      segmentIndex: num(item.segmentIndex) ?? -1,
      quote: text(item.quote),
    }))
    .filter(
      (item): item is FrameworkSellingPoint =>
        item.startMs !== null && item.endMs !== null && item.endMs > item.startMs && item.labelKeys.length > 0,
    )
    .sort((a, b) => a.startMs - b.startMs);
  const transcript = (Array.isArray(framework.transcript) ? framework.transcript : [])
    .map((row) => (Array.isArray(row) ? { startMs: num(row[0]), endMs: num(row[1]), text: text(row[2]) } : null))
    .filter((row): row is TranscriptLine => !!row && row.startMs !== null && row.endMs !== null && !!row.text)
    .sort((a, b) => a.startMs - b.startMs);
  const frameworkLabels = stringMap(labels?.framework);
  const sellingPointLabels = stringMap(labels?.sellingPoint);
  const order = record(framework.labelOrder);
  return {
    status: text(framework.status) || 'failed',
    reason: text(framework.reason),
    transcriptError: text(framework.transcriptError),
    sellingPointError: text(framework.sellingPointError),
    labels: { framework: frameworkLabels, sellingPoint: sellingPointLabels },
    labelOrder: {
      framework: labelOrder(order?.framework, frameworkLabels, FRAMEWORK_ORDER),
      sellingPoint: labelOrder(order?.sellingPoint, sellingPointLabels, []),
    },
    segments,
    sellingPoints,
    transcript,
  };
}

function readLabels(value: unknown): CardLabels {
  const labels: CardLabels = {};
  for (const [category, entries] of Object.entries(record(value) ?? {})) {
    const map = record(entries);
    if (!map) continue;
    labels[category] = Object.fromEntries(
      Object.entries(map).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }
  return labels;
}

/** Display name of a taxonomy key, without the clarification in brackets; the key when unknown. */
export function labelOf(labels: CardLabels, category: string, key: string | null | undefined): string {
  if (!key) return '--';
  const name = labels[category]?.[key];
  return name ? name.replace(/[（(].*[)）]$/, '').trim() || name : key;
}

/** The full dictionary text (with clarification), for tooltips. */
export function labelDetail(labels: CardLabels, category: string, key: string): string | null {
  return labels[category]?.[key] ?? null;
}

function readDimension(value: unknown, textKey: string, kindKey: string) {
  const dimension = record(value);
  if (!dimension) return null;
  return {
    assessment: text(dimension.assessment),
    labels: records(dimension.labels)
      .map((item) => ({ text: text(item[textKey]), kind: text(item[kindKey]) }))
      .filter((item) => item.text || item.kind),
  };
}

function readHook(value: unknown): CardHook | null {
  const hook = record(value);
  if (!hook) return null;
  return {
    assessment: text(hook.assessment),
    speech: optionalText(hook.speech),
    onscreenText: optionalText(hook.onscreen_text),
    visual: text(hook.visual),
    mechanismIds: texts(hook.mechanism_ids),
    audioCues: texts(hook.audio_cues).filter((cue) => cue !== 'none'),
    whyKeepWatching: text(hook.why_keep_watching),
    completeHookEndSec: num(hook.complete_hook_end_sec),
  };
}

function readSegment(item: JsonRecord): CardSegment | null {
  const startSec = num(item.start_sec);
  const endSec = num(item.end_sec);
  if (startSec === null || endSec === null) return null;
  return {
    id: text(item.id),
    startSec,
    endSec,
    primaryRole: text(item.primary_role),
    secondaryRoles: texts(item.secondary_roles),
    contentForms: texts(item.content_forms),
    voiceForm: optionalText(item.voice_form),
    tone: optionalText(item.tone),
    music: optionalText(item.music),
    sfx: texts(item.sfx),
    summary: text(item.summary),
    evidenceRefs: texts(item.evidence_refs),
    claimRefs: [...new Set(texts(item.claim_refs))],
  };
}

function readEvidence(item: JsonRecord): CardEvidence {
  const time = record(item.time);
  return {
    id: text(item.id),
    modality: text(item.modality),
    startSec: num(time?.start_sec),
    endSec: num(time?.end_sec),
    content: text(item.content),
    quality: text(item.quality),
  };
}

function readClaim(item: JsonRecord): CardClaim {
  return {
    id: text(item.id),
    text: text(item.text),
    sellingPoint: text(item.selling_point),
    qualifiers: texts(item.qualifiers),
    statedRefs: texts(item.stated_refs),
    shownRefs: texts(item.shown_refs),
    evidenceForm: text(item.evidence_form),
    support: text(item.support),
    limitation: text(item.limitation),
  };
}

export function readCompetitorCard(value: unknown): CompetitorCard | null {
  const card = record(value);
  if (!card) return null;
  const product = record(card.product);
  const dimensions = record(card.dimensions);
  const offer = record(dimensions?.offer_and_cta);
  const sound = record(dimensions?.sound);
  const transfer = record(card.transfer);
  const structure = record(card.structure);
  const evidence = new Map(
    records(card.evidence)
      .map(readEvidence)
      .filter((item) => item.id)
      .map((item) => [item.id, item]),
  );
  return {
    analysisStatus: text(card.analysis_status),
    limitations: texts(card.limitations),
    summary: text(card.summary),
    purchaseQuestion: text(card.purchase_question),
    hook: readHook(card.hook),
    segments: records(card.segments)
      .map(readSegment)
      .filter((item): item is CardSegment => item !== null)
      .sort((a, b) => a.startSec - b.startSec),
    evidence,
    claims: records(card.claims).map(readClaim).filter((claim) => claim.text),
    product: {
      brand: optionalText(product?.brand),
      name: optionalText(product?.name),
      category: optionalText(product?.category),
    },
    audiences: readDimension(dimensions?.audiences, 'label', 'basis'),
    scenes: readDimension(dimensions?.scenes, 'label', 'source'),
    trustCues: readDimension(dimensions?.trust_cues, 'raw', 'cue'),
    offers: offer
      ? {
          assessment: text(offer.assessment),
          offers: records(offer.offers).map((item) => text(item.text)).filter(Boolean),
          cta: texts(offer.cta),
        }
      : null,
    sound: sound ? { assessment: text(sound.assessment), summary: text(sound.summary) } : null,
    transfer: {
      methods: texts(transfer?.methods),
      brandDependent: texts(transfer?.brand_dependent),
      weNeed: texts(transfer?.we_need),
    },
    path: texts(structure?.path),
    labels: readLabels(card.labels),
    framework: readFramework(card.framework),
  };
}

export interface EvidenceMedia {
  kind: 'clip' | 'frame' | 'sample';
  startMs: number;
  endMs: number;
  url: string;
}

const MEDIA_KINDS = new Set(['clip', 'frame', 'sample']);

/** Signed evidence objects from the API; items without a URL are skipped. */
export function readEvidenceMedia(value: unknown): { clip: EvidenceMedia | null; frames: EvidenceMedia[]; samples: EvidenceMedia[] } {
  const items = records(value)
    .map((item) => ({
      kind: typeof item.kind === 'string' && MEDIA_KINDS.has(item.kind) ? (item.kind as EvidenceMedia['kind']) : null,
      startMs: num(item.startMs) ?? 0,
      endMs: num(item.endMs) ?? 0,
      url: text(item.url),
    }))
    .filter((item): item is EvidenceMedia => item.kind !== null && item.url !== '');
  return {
    clip: items.find((item) => item.kind === 'clip') ?? null,
    frames: items.filter((item) => item.kind === 'frame').sort((a, b) => a.startMs - b.startMs),
    samples: items.filter((item) => item.kind === 'sample').sort((a, b) => a.startMs - b.startMs),
  };
}

/** Transcript lines that overlap [startMs, endMs). */
export function linesWithin(lines: readonly TranscriptLine[], startMs: number, endMs: number): TranscriptLine[] {
  return lines.filter((line) => line.startMs < endMs && line.endMs > startMs);
}

/** Selling-point labels by how many spans carry them, most first; ties keep preset order. */
export function sellingPointCounts(framework: CardFramework): Array<{ key: string; name: string; count: number }> {
  const order = framework.labelOrder.sellingPoint;
  const counts = new Map<string, number>();
  for (const point of framework.sellingPoints) {
    for (const key of point.labelKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, name: framework.labels.sellingPoint[key] ?? key, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
}

/** `m:ss` (or `m:ss.s` when the value has a fraction), the clock users see in Douyin. */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '--';
  const tenths = Math.round(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths - minutes * 600) / 10;
  return `${minutes}:${Number.isInteger(rest) ? String(rest).padStart(2, '0') : rest.toFixed(1).padStart(4, '0')}`;
}

/** Overlapping spans go to the next row, so every block on a timeline keeps its true position and length. */
export function packRows<T extends { startMs: number; endMs: number }>(spans: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (const span of [...spans].sort((a, b) => a.startMs - b.startMs)) {
    const row = rows.find((candidate) => candidate[candidate.length - 1].endMs <= span.startMs);
    if (row) row.push(span);
    else rows.push([span]);
  }
  return rows;
}
