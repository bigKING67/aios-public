/**
 * 竞品爆款 statistics read model (爆款分析). Every number comes from the locked snapshot written by the
 * competitor worker (stats.py); this module only picks the unit, applies the
 * small-sample rule and joins display names. Readers are defensive so a partial
 * or older payload renders what it has.
 */
import { apiClient } from '@/lib/api-client';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  AIOS_API_PATHS,
  type StudioCompetitorPatternsResponse,
} from '@/lib/generated-api-contract';
import { aiStudioQueryKeys } from './ai-studio-api';
import { type Breakdown, readBreakdown } from './competitor-breakdown';
import { type CardLabels, labelDetail, labelOf } from './competitor-card';
import type { PeriodQuery } from './studio-period';

/** family = opening-line families (re-used master footage counted once); film = every video. */
export type PatternUnit = 'family' | 'film';

export const DEFAULT_PATTERN_CATEGORY = 'loose_powder';
/** Below this many films a share is shown as x/n only, never as a percentage. */
export const SMALL_SAMPLE_FILMS = 10;

export const competitorPatternQueryKeys = {
  patterns: (category: string, period: PeriodQuery) =>
    [...aiStudioQueryKeys.root, 'competitor', 'patterns', category, period] as const,
};

export async function fetchCompetitorPatterns(
  category: string,
  period: PeriodQuery,
  options?: { signal?: AbortSignal },
): Promise<StudioCompetitorPatternsResponse> {
  return (
    await apiClient.get<StudioCompetitorPatternsResponse>(AIOS_API_PATHS.contentStudioCompetitorPatterns, {
      params: { category, ...period },
      signal: options?.signal,
    })
  ).data;
}

type JsonRecord = Record<string, unknown>;

export interface PatternRow {
  dimension: string;
  label: string;
  numerator: number;
  denominator: number;
  partialCount: number;
  unassessableCount: number;
  blockedCount: number;
  familyNumerator: number;
  familyDenominator: number;
  exampleFilms: string[];
}

export interface DimensionCounts {
  denominator: number;
  familyDenominator: number;
  partialCount: number;
  unassessableCount: number;
  blockedCount: number;
}

export interface PatternTextLabel {
  text: string;
  films: number;
  kinds: Record<string, number>;
  exampleFilms: string[];
}

export interface PatternPayload {
  sample: {
    films: number;
    families: number;
    statuses: Record<string, number>;
    otherVersions: Record<string, number>;
    unreadable: number;
  };
  rows: PatternRow[];
  /** Denominators per dimension, also for dimensions where no film carries a label. */
  dimensions: Record<string, DimensionCounts>;
  roleTime: { coveredSec: number; unknownGapSec: number; share: Record<string, number> };
  text: Record<'scenes' | 'audiences', { denominator: number; labels: PatternTextLabel[] }>;
  /** 框架结构排行; null on snapshots written before it existed. */
  structures: PatternStructures | null;
  /** 爆款拆解 blocks; null on snapshots written before them (stats v2). */
  breakdown: Breakdown | null;
  films: Record<string, { analysisId: string; title: string | null }>;
  labels: CardLabels;
}

export const STRUCTURE_LANES = ['framework', 'sellingPoint'] as const;
const ELEMENT_KINDS: readonly StructureElementKind[] = ['has', 'first', 'last', 'size'];
export type StructureLane = (typeof STRUCTURE_LANES)[number];
export type StructureSort = 'families' | 'sales';

/** The `lane` URL parameter of 框架结构排行 (框架 unless it says 卖点). */
export function readStructureLaneParam(value: string | null): StructureLane {
  return value === 'sellingPoint' ? 'sellingPoint' : 'framework';
}

/** The `sort` URL parameter of 框架结构排行 (母版 count unless it says sales). */
export function readStructureSort(value: string | null): StructureSort {
  return value === 'sales' ? 'sales' : 'families';
}

/** 罗盘 bands summed over room-days (yuan); `max` is null when a band has no top. */
export interface StructureSales {
  min: number;
  max: number | null;
  rooms: number;
  roomDays: number;
}

export interface StructureRow {
  key: string;
  labels: string[];
  films: number;
  families: number;
  /** Brands the films come from (snapshot structure v3 on; 0 before). */
  brands: number;
  sales: StructureSales;
  exampleFilms: string[];
}

export type StructureElementKind = 'has' | 'first' | 'last' | 'size';

/** A structure element of a lane (snapshot v2 on): has a label, opens / closes with one, or a size bucket. */
export interface StructureElement {
  key: string;
  kind: StructureElementKind;
  /** The label key, or the size bucket (`steps_short`, `points_many`, …). */
  label: string;
  films: number;
  families: number;
}

export interface StructureLaneStats {
  films: number;
  families: number;
  /** Films with a built structure but no label in this lane (no selling point found). */
  empty: number;
  rows: StructureRow[];
  /** Empty on snapshots written before elements existed. */
  elements: StructureElement[];
}

export interface PatternStructures {
  films: number;
  /** Films in scope without a built structure. */
  missing: number;
  sales: { available: boolean; films: number };
  labels: Record<StructureLane, Record<string, string>>;
  labelOrder: Record<StructureLane, string[]>;
  framework: StructureLaneStats;
  sellingPoint: StructureLaneStats;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function counts(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(record(value)).map(([key, item]) => [key, count(item)]));
}

function readRow(value: unknown): PatternRow | null {
  const row = record(value);
  if (typeof row.dimension !== 'string' || typeof row.label !== 'string') return null;
  return {
    dimension: row.dimension,
    label: row.label,
    numerator: count(row.numerator),
    denominator: count(row.denominator),
    partialCount: count(row.partial_count),
    unassessableCount: count(row.unassessable_count),
    blockedCount: count(row.blocked_count),
    familyNumerator: count(row.family_numerator),
    familyDenominator: count(row.family_denominator),
    exampleFilms: texts(row.example_films),
  };
}

function readText(value: unknown) {
  const part = record(value);
  const labels = Array.isArray(part.labels) ? part.labels.map(record) : [];
  return {
    denominator: count(part.denominator),
    labels: labels
      .filter((label) => typeof label.text === 'string' && label.text)
      .map((label) => ({
        text: label.text as string,
        films: count(label.films),
        kinds: counts(label.kinds),
        exampleFilms: texts(label.example_films),
      })),
  };
}

function names(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function readStructureRow(value: unknown): StructureRow | null {
  const row = record(value);
  const labels = texts(row.labels);
  if (typeof row.key !== 'string' || labels.length === 0) return null;
  const sales = record(row.sales);
  return {
    key: row.key,
    labels,
    films: count(row.films),
    families: count(row.families),
    brands: count(row.brands),
    sales: {
      min: count(sales.min),
      max: typeof sales.max === 'number' ? count(sales.max) : null,
      rooms: count(sales.rooms),
      roomDays: count(sales.roomDays),
    },
    exampleFilms: texts(row.exampleFilms),
  };
}

function readStructureLane(value: unknown): StructureLaneStats {
  const lane = record(value);
  return {
    films: count(lane.films),
    families: count(lane.families),
    empty: count(lane.empty),
    rows: (Array.isArray(lane.rows) ? lane.rows : []).map(readStructureRow).filter((row): row is StructureRow => !!row),
    elements: (Array.isArray(lane.elements) ? lane.elements : []).flatMap((item) => {
      const element = record(item);
      const kind = element.kind as StructureElementKind;
      if (typeof element.key !== 'string' || typeof element.label !== 'string' || !ELEMENT_KINDS.includes(kind)) return [];
      return [{ key: element.key, kind, label: element.label, films: count(element.films), families: count(element.families) }];
    }),
  };
}

function readStructures(value: unknown): PatternStructures | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const structures = record(value);
  const sales = record(structures.sales);
  const labels = record(structures.labels);
  const order = record(structures.labelOrder);
  return {
    films: count(structures.films),
    missing: count(structures.missing),
    sales: { available: sales.available === true, films: count(sales.films) },
    labels: { framework: names(labels.framework), sellingPoint: names(labels.sellingPoint) },
    labelOrder: { framework: texts(order.framework), sellingPoint: texts(order.sellingPoint) },
    framework: readStructureLane(structures.framework),
    sellingPoint: readStructureLane(structures.sellingPoint),
  };
}

export function readPatternPayload(value: unknown): PatternPayload {
  const payload = record(value);
  const sample = record(payload.sample);
  const roleTime = record(payload.roleTime);
  const text = record(payload.text);
  const labels: CardLabels = {};
  for (const [category, entries] of Object.entries(record(payload.labels))) {
    labels[category] = Object.fromEntries(
      Object.entries(record(entries)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }
  const dimensions: PatternPayload['dimensions'] = {};
  for (const [key, value] of Object.entries(record(payload.dimensions))) {
    const item = record(value);
    dimensions[key] = {
      denominator: count(item.denominator),
      familyDenominator: count(item.family_denominator),
      partialCount: count(item.partial_count),
      unassessableCount: count(item.unassessable_count),
      blockedCount: count(item.blocked_count),
    };
  }
  const films: PatternPayload['films'] = {};
  for (const [awemeId, film] of Object.entries(record(payload.films))) {
    const item = record(film);
    if (typeof item.analysisId === 'string') {
      films[awemeId] = { analysisId: item.analysisId, title: typeof item.title === 'string' ? item.title : null };
    }
  }
  return {
    sample: {
      films: count(sample.films),
      families: count(sample.families),
      statuses: counts(sample.statuses),
      otherVersions: counts(sample.otherVersions),
      unreadable: count(sample.unreadable),
    },
    rows: (Array.isArray(payload.rows) ? payload.rows : []).map(readRow).filter((row): row is PatternRow => !!row),
    dimensions,
    roleTime: {
      coveredSec: count(roleTime.covered_sec),
      unknownGapSec: count(roleTime.unknown_gap_sec),
      share: counts(roleTime.share),
    },
    text: { scenes: readText(text.scenes), audiences: readText(text.audiences) },
    structures: readStructures(payload.structures),
    breakdown: readBreakdown(payload.breakdown),
    films,
    labels,
  };
}

/** Taxonomy dictionary of each statistic dimension (the payload's `labels` keys). */
const DIMENSION_LABELS: Record<string, string> = {
  hook: 'hook_mechanisms',
  hook_audio: 'hook_audio_cues',
  selling_point: 'selling_points',
  selling_point_shown: 'selling_points',
  evidence_form: 'evidence_forms',
  content_form: 'content_forms',
  trust_cues: 'trust_cues',
  offer_and_cta: 'cta',
  voice_form: 'voice_forms',
  tone: 'tones',
  sell_tone: 'tones',
  music: 'music',
  sell_music: 'music',
  sfx: 'sfx',
};

export interface PatternExample {
  awemeId: string;
  analysisId: string | null;
  title: string;
}

export interface PatternBar {
  key: string;
  name: string;
  detail: string | null;
  numerator: number;
  denominator: number;
  /** Null when the sample is small or the denominator is zero: show x/n only. */
  rate: number | null;
  /** Brands behind the count (structure rows by film count). */
  brands?: number;
  examples: PatternExample[];
}

export interface PatternDimension {
  denominator: number;
  partial: number;
  unassessable: number;
  blocked: number;
  bars: PatternBar[];
}

export function isSmallSample(payload: PatternPayload): boolean {
  return payload.sample.films < SMALL_SAMPLE_FILMS;
}

/** Display name of a statistic label (opening paths join their roles). */
export function labelName(payload: PatternPayload, dimension: string, key: string): { name: string; detail: string | null } {
  if (dimension === 'opening_path') {
    return { name: key.split(' > ').map((role) => labelOf(payload.labels, 'roles', role)).join(' → '), detail: null };
  }
  const category = DIMENSION_LABELS[dimension];
  if (!category) return { name: key, detail: null };
  return { name: labelOf(payload.labels, category, key), detail: labelDetail(payload.labels, category, key) };
}

/** The 爆款视频 page with one analysis open. */
export function competitorAnalysisHref(analysisId: string): string {
  return `${ROUTE_PATHS.contentAiStudioTrends}?analysis=${encodeURIComponent(analysisId)}`;
}

export function examplesOf(payload: PatternPayload, awemeIds: string[]): PatternExample[] {
  return awemeIds.map((awemeId) => {
    const film = payload.films[awemeId];
    return { awemeId, analysisId: film?.analysisId ?? null, title: film?.title?.trim() || `抖音作品 ${awemeId}` };
  });
}

/** One dimension's bars in the chosen unit; the counts of films outside its denominator ride along. */
export function patternDimension(payload: PatternPayload, dimension: string, unit: PatternUnit): PatternDimension {
  const rows = payload.rows.filter((row) => row.dimension === dimension);
  const small = isSmallSample(payload);
  const bars = rows
    .map((row) => {
      const numerator = unit === 'family' ? row.familyNumerator : row.numerator;
      const denominator = unit === 'family' ? row.familyDenominator : row.denominator;
      return {
        key: row.label,
        ...labelName(payload, dimension, row.label),
        numerator,
        denominator,
        rate: small || denominator === 0 ? null : numerator / denominator,
        examples: examplesOf(payload, row.exampleFilms),
      };
    })
    .sort((a, b) => b.numerator - a.numerator || a.name.localeCompare(b.name, 'zh-CN'));
  // Older snapshots have no summary: their rows carry the same counts (absent when no label occurred).
  const first = rows[0];
  const counts: DimensionCounts = payload.dimensions[dimension] ?? {
    denominator: first?.denominator ?? 0,
    familyDenominator: first?.familyDenominator ?? 0,
    partialCount: first?.partialCount ?? 0,
    unassessableCount: first?.unassessableCount ?? 0,
    blockedCount: first?.blockedCount ?? 0,
  };
  return {
    denominator: unit === 'family' ? counts.familyDenominator : counts.denominator,
    partial: counts.partialCount,
    unassessable: counts.unassessableCount,
    blocked: counts.blockedCount,
    bars,
  };
}

/** "3/7" or "3/7 · 43%". */
export function formatShare(bar: Pick<PatternBar, 'numerator' | 'denominator' | 'rate'>): string {
  const share = `${bar.numerator}/${bar.denominator}`;
  return bar.rate === null ? share : `${share} · ${Math.round(bar.rate * 100)}%`;
}

const STRUCTURE_JOINERS: Record<StructureLane, string> = { framework: ' → ', sellingPoint: ' + ' };

/** A lane's rows as share bars: by films (x/n of the lane's films, re-posts included), or by 关联直播间销售额
 * (rows with 罗盘 sales only, the bar against the top row's lower bound). */
export function structureBars(payload: PatternPayload, lane: StructureLane, sort: StructureSort): PatternBar[] {
  const structures = payload.structures;
  if (!structures) return [];
  const stats = structures[lane];
  const small = isSmallSample(payload);
  const name = (row: StructureRow) =>
    row.labels.map((key) => structures.labels[lane][key] ?? key).join(STRUCTURE_JOINERS[lane]);
  if (sort === 'families') {
    return [...stats.rows]
      .sort((a, b) => b.films - a.films || b.brands - a.brands || a.key.localeCompare(b.key))
      .map((row) => ({
        key: row.key,
        name: name(row),
        detail: null,
        numerator: row.films,
        denominator: stats.films,
        rate: small || stats.films === 0 ? null : row.films / stats.films,
        brands: row.brands,
        examples: examplesOf(payload, row.exampleFilms),
      }));
  }
  const rows = stats.rows
    .filter((row) => row.sales.roomDays > 0)
    .sort((a, b) => b.sales.min - a.sales.min || b.films - a.films || a.key.localeCompare(b.key));
  const top = rows[0]?.sales.min ?? 0;
  return rows.map((row) => ({
    key: row.key,
    name: name(row),
    detail: `${row.sales.rooms} 个直播间 · ${row.sales.roomDays} 个直播日 · ${row.films} 条视频`,
    numerator: row.sales.min,
    denominator: top,
    rate: null,
    examples: examplesOf(payload, row.exampleFilms),
  }));
}

function yuan(value: number): string {
  if (value < 10_000) return `¥${Math.round(value).toLocaleString('zh-CN')}`;
  const wan = value / 10_000;
  return `¥${Number(wan >= 100 ? wan.toFixed(0) : wan.toFixed(1))}万`;
}

/** 罗盘 bands summed: "¥150万–325万", "¥150万+" with an open top band, one figure when they meet. */
export function formatSales(sales: Pick<StructureSales, 'min' | 'max'>): string {
  if (sales.max === null) return `${yuan(sales.min)}+`;
  if (sales.max === sales.min) return yuan(sales.min);
  return `${yuan(sales.min)}–${yuan(sales.max).slice(1)}`;
}

/** 框架结构排行, our side (`ownStructures` of the patterns response): our originals' structures. */
export interface OwnStructureLane {
  /** Originals with a confirmed segment of this lane's preset. */
  assets: number;
  /** Their 视频云管家 spend in the window (yuan). */
  spend: number;
  labels: Record<string, string>;
  rows: { labels: string[]; assets: number; spend: number }[];
}

export interface OwnStructures extends Record<StructureLane, OwnStructureLane> {
  /** Days of the window with synced per-day spend; `days` is null for all time. */
  spendDays: { days: number | null; synced: number };
}

function readOwnLane(value: unknown): OwnStructureLane {
  const lane = record(value);
  return {
    assets: count(lane.assets),
    spend: count(lane.spend),
    labels: names(lane.labels),
    rows: (Array.isArray(lane.rows) ? lane.rows : []).flatMap((item) => {
      const row = record(item);
      const labels = texts(row.labels);
      return labels.length ? [{ labels, assets: count(row.assets), spend: count(row.spend) }] : [];
    }),
  };
}

/** Null from an API without our side, so the page says it cannot compare rather than showing zeros. */
export function readOwnStructures(response: StudioCompetitorPatternsResponse | undefined): OwnStructures | null {
  const value = (response as { ownStructures?: unknown } | undefined)?.ownStructures;
  if (!value || typeof value !== 'object') return null;
  const own = record(value);
  const days = record(own.spendDays);
  return {
    framework: readOwnLane(own.framework),
    sellingPoint: readOwnLane(own.sellingPoint),
    spendDays: { days: typeof days.days === 'number' ? days.days : null, synced: count(days.synced) },
  };
}

export interface StructureShare {
  numerator: number;
  denominator: number;
  /** Null below the small-sample threshold: show x/n only. */
  rate: number | null;
  /** Our side only: numerator and denominator are yuan of spend (D16), not counts. */
  spend?: boolean;
  /** Our side only: originals behind the denominator, which gates 我方没有 / 我方偏少. */
  originals?: number;
}

/** Our share of a structure or element: its spend over the lane's when the lane has spend in the window, else
 * its originals over the lane's (originals without spend data). */
function ownShare(lane: OwnStructureLane | undefined, assets: number, spend: number): StructureShare | null {
  if (!lane?.assets) return null;
  if (lane.spend > 0) return { numerator: spend, denominator: lane.spend, rate: spend / lane.spend, spend: true, originals: lane.assets };
  return {
    numerator: assets,
    denominator: lane.assets,
    rate: lane.assets < SMALL_SAMPLE_FILMS ? null : assets / lane.assets,
    originals: lane.assets,
  };
}

/** 我方 figure: "¥1.2万 · 31%" for spend, else the x/n share. */
export function formatOwnShare(share: StructureShare): string {
  if (!share.spend) return formatShare(share);
  return `${yuan(share.numerator)} · ${Math.round((share.rate ?? 0) * 100)}%`;
}

/** The lane's total for the 我方 heading: "12 条原片 · ¥8.5万". */
export function formatOwnLane(lane: OwnStructureLane): string {
  return lane.spend > 0 ? `${lane.assets} 条原片 · ${yuan(lane.spend)}` : `${lane.assets} 条原片`;
}

export interface StructureComparisonRow {
  key: string;
  labels: string[];
  name: string;
  /** Competitor bar (films, or 关联直播间销售额); null for a structure only we have. */
  comp: PatternBar | null;
  /** Our side for this structure; null when there is no data of ours in this lane. */
  ours: StructureShare | null;
  mark: StructureMark;
}

/**
 * 我方没有: competitors put at least 10% of the window's films from 2+ brands into it and ours is zero
 * (an original with it but no spend in the window counts as zero). 我方偏少: an element competitors use
 * at least 常见 where our share is under half theirs. Never with fewer than 10 originals of ours.
 */
export type StructureMark = 'missing' | 'fewer' | null;
export const MARK_NAMES: Record<Exclude<StructureMark, null>, string> = { missing: '我方没有', fewer: '我方偏少' };
/** Below this many originals of ours a difference is shown but never marked. */
export const OURS_MIN_FOR_GAPS = 10;
const MISSING_SHARE = 0.1;
const MISSING_BRANDS = 2;

/** The host's frequency word for a competitor share (same thresholds as the report worker). */
export function frequencyWord(numerator: number, denominator: number): '多数' | '常见' | '少数' {
  if (denominator && 2 * numerator >= denominator) return '多数';
  if (denominator && 3 * numerator >= denominator) return '常见';
  return '少数';
}

/** A structure's identity on both sides: a framework sequence as is, a selling-point set in preset order. */
function structureKey(lane: StructureLane, labels: string[], order: string[]): string {
  if (lane === 'framework') return labels.join(' > ');
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  return [...new Set(labels)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).join(' + ');
}

/** 竞品 vs 我方 per structure: the competitor order first, then structures only we have (母版 order only). */
export function structureComparison(
  payload: PatternPayload,
  own: OwnStructures | null,
  lane: StructureLane,
  sort: StructureSort,
): StructureComparisonRow[] {
  const structures = payload.structures;
  if (!structures) return [];
  const order = structures.labelOrder[lane];
  const ownLane = own?.[lane];
  const ours = new Map<string, { labels: string[]; assets: number; spend: number }>();
  for (const row of ownLane?.rows ?? []) {
    const key = structureKey(lane, row.labels, order);
    const seenRow = ours.get(key);
    ours.set(key, { labels: row.labels, assets: (seenRow?.assets ?? 0) + row.assets, spend: (seenRow?.spend ?? 0) + row.spend });
  }
  const share = (key: string): StructureShare | null => ownShare(ownLane, ours.get(key)?.assets ?? 0, ours.get(key)?.spend ?? 0);
  const nameOf = (labels: string[]) =>
    labels.map((key) => structures.labels[lane][key] ?? ownLane?.labels[key] ?? key).join(STRUCTURE_JOINERS[lane]);
  const labelsOf = new Map(structures[lane].rows.map((row) => [row.key, row.labels]));
  const seen = new Set<string>();
  const rows: StructureComparisonRow[] = structureBars(payload, lane, sort).map((bar) => {
    const labels = labelsOf.get(bar.key) ?? [];
    const key = structureKey(lane, labels, order);
    seen.add(key);
    const side = share(key);
    const missing =
      sort === 'families' &&
      side !== null &&
      (side.originals ?? 0) >= OURS_MIN_FOR_GAPS &&
      side.numerator === 0 &&
      bar.denominator > 0 &&
      bar.numerator / bar.denominator >= MISSING_SHARE &&
      (bar.brands ?? 0) >= MISSING_BRANDS;
    return { key, labels, name: bar.name, comp: bar, ours: side, mark: missing ? 'missing' : null };
  });
  if (sort !== 'families' || !ownLane) return rows;
  const oursOnly = [...ours]
    .filter(([key]) => !seen.has(key))
    .map(([key, row]) => ({ key, labels: row.labels, name: nameOf(row.labels), comp: null, ours: share(key), mark: null }))
    .sort((a, b) => (b.ours?.numerator ?? 0) - (a.ours?.numerator ?? 0) || a.key.localeCompare(b.key));
  return [...rows, ...oursOnly];
}

const SIZE_BUCKETS: Record<StructureLane, readonly [string, string, string]> = {
  framework: ['steps_short', 'steps_three', 'steps_long'],
  sellingPoint: ['points_few', 'points_three', 'points_many'],
};
const SIZE_NAMES: Record<string, string> = {
  steps_short: '1–2 段',
  steps_three: '3 段',
  steps_long: '4 段及以上',
  points_few: '1–2 个卖点',
  points_three: '3 个卖点',
  points_many: '4 个及以上卖点',
};

/** Mirror of `structure_ranks.elements_of`: the elements of one structure (keys, kinds, labels). */
export function elementsOf(lane: StructureLane, labels: string[]): Pick<StructureElement, 'key' | 'kind' | 'label'>[] {
  if (labels.length === 0) return [];
  const found: Pick<StructureElement, 'key' | 'kind' | 'label'>[] = [...new Set(labels)].map((label) => ({
    key: `has_${label}`,
    kind: 'has',
    label,
  }));
  if (lane === 'framework') {
    found.push({ key: `first_${labels[0]}`, kind: 'first', label: labels[0] });
    found.push({ key: `last_${labels[labels.length - 1]}`, kind: 'last', label: labels[labels.length - 1] });
  }
  const size = lane === 'framework' ? labels.length : new Set(labels).size;
  const bucket = SIZE_BUCKETS[lane][size <= 2 ? 0 : size === 3 ? 1 : 2];
  found.push({ key: bucket, kind: 'size', label: bucket });
  return found;
}

export interface ElementComparisonRow {
  key: string;
  kind: StructureElementKind;
  label: string;
  name: string;
  comp: StructureShare;
  ours: StructureShare | null;
  /** 我方偏少: competitors at least 常见 and our share under half of theirs, with 10+ originals of ours. */
  mark: StructureMark;
}

const KIND_ORDER: StructureElementKind[] = ['has', 'first', 'last', 'size'];
const KIND_NAMES: Record<Exclude<StructureElementKind, 'size'>, string> = { has: '含', first: '开头是', last: '结尾是' };

/** 结构要素: competitor films vs our side per element, grouped has / first / last / size. */
export function elementComparison(
  payload: PatternPayload,
  own: OwnStructures | null,
  lane: StructureLane,
): ElementComparisonRow[] {
  const structures = payload.structures;
  if (!structures || structures[lane].elements.length === 0) return [];
  const stats = structures[lane];
  const order = structures.labelOrder[lane];
  const ownLane = own?.[lane];
  const ours = new Map<string, { assets: number; spend: number }>();
  for (const row of ownLane?.rows ?? []) {
    for (const element of elementsOf(lane, row.labels)) {
      const seen = ours.get(element.key);
      ours.set(element.key, { assets: (seen?.assets ?? 0) + row.assets, spend: (seen?.spend ?? 0) + row.spend });
    }
  }
  const small = isSmallSample(payload);
  const rank = (element: StructureElement) =>
    element.kind === 'size'
      ? SIZE_BUCKETS[lane].indexOf(element.label)
      : order.includes(element.label)
        ? order.indexOf(element.label)
        : order.length;
  return [...stats.elements]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || rank(a) - rank(b) || a.key.localeCompare(b.key))
    .map((element) => {
      const comp: StructureShare = {
        numerator: element.films,
        denominator: stats.films,
        rate: small || stats.films === 0 ? null : element.films / stats.films,
      };
      const side = ownShare(ownLane, ours.get(element.key)?.assets ?? 0, ours.get(element.key)?.spend ?? 0);
      const compRate = stats.films ? element.films / stats.films : 0;
      const name =
        element.kind === 'size'
          ? SIZE_NAMES[element.label] ?? element.label
          : `${KIND_NAMES[element.kind]}${structures.labels[lane][element.label] ?? ownLane?.labels[element.label] ?? element.label}`;
      return {
        key: element.key,
        kind: element.kind,
        label: element.label,
        name,
        comp,
        ours: side,
        mark:
          side !== null &&
          (side.originals ?? 0) >= OURS_MIN_FOR_GAPS &&
          frequencyWord(element.films, stats.films) !== '少数' &&
          side.numerator / side.denominator < compRate / 2
            ? 'fewer'
            : null,
      };
    });
}
