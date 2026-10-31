/**
 * Chart spec v1 for 竞品爆款 (DESIGN.md › Chart rendering). A spec says which
 * chart and which statistics; it never carries a number. Ranks name snapshot
 * rows by `stat_id` (`cohort:dimension:label`, as written by stats.py) and the
 * renderer reads numerator and denominator from the snapshot, so a spec written
 * by a model cannot invent or misquote a figure: an unknown id is dropped.
 */
import {
  type PatternBar,
  type PatternPayload,
  type PatternTextLabel,
  type PatternUnit,
  patternDimension,
} from './competitor-patterns';

export const OVERVIEW_METRICS = ['analyzed', 'families', 'brands', 'analyzing'] as const;
export type OverviewMetric = (typeof OVERVIEW_METRICS)[number];
export type TextPart = 'scenes' | 'audiences';

export type ChartSpec =
  | { kind: 'stat'; title: string; metrics: OverviewMetric[] }
  | { kind: 'rank'; title: string; statIds: string[] }
  | { kind: 'words'; title: string; part: TextPart; limit: number };

const MAX_SPECS = 12;
const MAX_ITEMS = 12;
const MAX_TITLE = 40;
const MAX_STAT_ID = 160;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function title(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= MAX_TITLE ? text : null;
}

function readSpec(value: unknown): ChartSpec | null {
  const spec = record(value);
  const name = title(spec?.title);
  if (!spec || !name) return null;
  if (spec.kind === 'stat') {
    if (!Array.isArray(spec.metrics) || spec.metrics.length === 0 || spec.metrics.length > MAX_ITEMS) return null;
    const metrics = spec.metrics.filter((item): item is OverviewMetric => OVERVIEW_METRICS.includes(item as OverviewMetric));
    return metrics.length === spec.metrics.length ? { kind: 'stat', title: name, metrics } : null;
  }
  if (spec.kind === 'rank') {
    if (!Array.isArray(spec.statIds) || spec.statIds.length === 0 || spec.statIds.length > MAX_ITEMS) return null;
    const ids = spec.statIds.filter((item): item is string => typeof item === 'string' && item.length <= MAX_STAT_ID);
    return ids.length === spec.statIds.length ? { kind: 'rank', title: name, statIds: ids } : null;
  }
  if (spec.kind === 'words') {
    const limit = typeof spec.limit === 'number' && Number.isInteger(spec.limit) ? spec.limit : MAX_ITEMS;
    if ((spec.part !== 'scenes' && spec.part !== 'audiences') || limit < 1 || limit > MAX_ITEMS * 2) return null;
    return { kind: 'words', title: name, part: spec.part, limit };
  }
  return null;
}

/** Validates untrusted specs (e.g. model output); a malformed spec is rejected whole, never patched. */
export function readChartSpecs(value: unknown): { specs: ChartSpec[]; rejected: number } {
  if (!Array.isArray(value)) return { specs: [], rejected: value === undefined || value === null ? 0 : 1 };
  const candidates = value.slice(0, MAX_SPECS);
  const specs = candidates.map(readSpec).filter((spec): spec is ChartSpec => spec !== null);
  return { specs, rejected: value.length - specs.length };
}

export function statId(cohort: string, dimension: string, label: string): string {
  return `${cohort}:${dimension}:${label}`;
}

function parseStatId(id: string): { cohort: string; dimension: string; label: string } | null {
  const first = id.indexOf(':');
  const second = id.indexOf(':', first + 1);
  if (first <= 0 || second <= first + 1 || second === id.length - 1) return null;
  return { cohort: id.slice(0, first), dimension: id.slice(first + 1, second), label: id.slice(second + 1) };
}

/** Bars of a rank spec, in spec order; ids outside this cohort or snapshot are counted in `dropped`. */
export function resolveRank(
  spec: Extract<ChartSpec, { kind: 'rank' }>,
  payload: PatternPayload,
  cohort: string,
  unit: PatternUnit,
): { bars: PatternBar[]; dropped: number } {
  const byDimension = new Map<string, Map<string, PatternBar>>();
  const bars: PatternBar[] = [];
  for (const id of spec.statIds) {
    const ref = parseStatId(id);
    if (!ref || ref.cohort !== cohort) continue;
    let rows = byDimension.get(ref.dimension);
    if (!rows) {
      rows = new Map(patternDimension(payload, ref.dimension, unit).bars.map((bar) => [bar.key, bar]));
      byDimension.set(ref.dimension, rows);
    }
    const bar = rows.get(ref.label);
    if (bar && !bars.includes(bar)) bars.push(bar);
  }
  return { bars, dropped: spec.statIds.length - bars.length };
}

export function resolveWords(spec: Extract<ChartSpec, { kind: 'words' }>, payload: PatternPayload) {
  const part = payload.text[spec.part];
  return { denominator: part.denominator, labels: part.labels.slice(0, spec.limit) as PatternTextLabel[] };
}

/** The top `count` rows of a dimension as stat ids (most films first, as patternDimension sorts). */
export function topStatIds(payload: PatternPayload, cohort: string, dimension: string, unit: PatternUnit, count = 3): string[] {
  return patternDimension(payload, dimension, unit)
    .bars.filter((bar) => bar.numerator > 0)
    .slice(0, count)
    .map((bar) => statId(cohort, dimension, bar.key));
}
