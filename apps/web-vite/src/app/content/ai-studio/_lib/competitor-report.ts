/**
 * 竞品爆款 · 爆款拆解 report read model (semantic openings v1 / reading v13; competitor_analysis/report_breakdown.py):
 * opening formulas, readings of the formula / scene / endorser blocks, 黄金结构 and 下一条怎么拍. The model
 * cites row ids only (f1, s1, e1, k1); every number shown comes from the rows the worker counted — the
 * formulas in `report.formulas`, the rest in `inputs` — and a citation without a row is dropped.
 */
import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type StudioCompetitorReport,
  type StudioCompetitorReportLatestResponse,
} from '@/lib/generated-api-contract';
import { aiStudioQueryKeys } from './ai-studio-api';
import { readTop, type EndorserRole, type TopFilm } from './competitor-breakdown';
import type { PeriodQuery } from './studio-period';

export const competitorReportQueryKeys = {
  latest: (category: string, period: PeriodQuery) =>
    [...aiStudioQueryKeys.root, 'competitor', 'report', category, period] as const,
};

export async function fetchLatestCompetitorReport(
  category: string,
  period: PeriodQuery,
  options?: { signal?: AbortSignal; kind?: 'openings' },
): Promise<StudioCompetitorReportLatestResponse> {
  return (
    await apiClient.get<StudioCompetitorReportLatestResponse>(AIOS_API_PATHS.contentStudioCompetitorReportLatest, {
      params: { category, ...period, ...(options?.kind ? { kind: options.kind } : {}) },
      signal: options?.signal,
    })
  ).data;
}

/** Starts a billable model call: never retried by the client. */
export async function requestCompetitorReport(category: string, period: PeriodQuery, options?: { kind: 'openings'; retry?: boolean }): Promise<StudioCompetitorReport> {
  return (
    await apiClient.post<StudioCompetitorReport>(
      AIOS_API_PATHS.contentStudioCompetitorReports,
      { category, ...period, ...options },
      { retryAttempts: 0 },
    )
  ).data;
}

/** Estimate for the optional reading; successful opening formulas are reused. */
export const ESTIMATED_CNY_PER_REPORT = '0.05–0.12';

export const PRIORITY_NAMES: Readonly<Record<string, string>> = { now: '现在', next: '下一步', later: '以后' };

const TITLE_CHARS = 18;

/** A film title up to its first hashtag, cut to one short line (the full title goes in the link's tooltip). */
export function shortTitle(title: string): string {
  const head = title.split('#')[0].trim() || title.trim();
  return head.length > TITLE_CHARS ? `${head.slice(0, TITLE_CHARS)}…` : head;
}

export type ReportStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface Counted {
  id: string;
  films: number;
  brands: number;
}

export interface ReportFormula extends Counted {
  template: string;
  /** Representative opening lines of the formula's groups. */
  examples: string[];
  mechanisms: string[];
  top: TopFilm[];
  sources: TopFilm[];
}

export interface ReportScene extends Counted {
  scene: string;
  pain: string;
  sellingPoint: string;
  otherPoint: string | null;
}

export interface ReportEndorser extends Counted {
  name: string;
  role: EndorserRole;
}

export interface ReportStructure extends Counted {
  key: string;
  name: string;
}

/** One reading: the model's sentence and the rows it cites (unknown ids dropped). */
export interface ReportReading {
  statement: string;
  refs: string[];
}

export interface ReportAction {
  id: string;
  priority: string;
  structure: ReportStructure | null;
  formula: ReportFormula | null;
  scene: ReportScene | null;
  sellingPoints: string;
  description: string;
}

export type FormulaStatus = 'ok' | 'fallback' | 'none';

export interface ReportView {
  reportId: string;
  status: ReportStatus;
  /** `fallback`: the formulas did not pass the host check and the opening groups stand in for them. */
  formulaStatus: FormulaStatus;
  formulas: ReportFormula[];
  unassignedFilms: number;
  unassignedSources: TopFilm[];
  scenes: ReportScene[];
  endorsers: ReportEndorser[];
  structures: ReportStructure[];
  hookReadings: ReportReading[];
  sceneReadings: ReportReading[];
  endorserReadings: ReportReading[];
  goldenStructures: ReportReading[];
  actions: ReportAction[];
  limitations: string[];
  sample: { films: number; brands: number; enriched: number };
  modelId: string | null;
  costYuan: number | null;
  createdAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface LatestReport {
  report: ReportView | null;
  /** The report was made for an older statistics snapshot. */
  stale: boolean;
  films: number | null;
  minFilms: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

const STATUSES: readonly ReportStatus[] = ['queued', 'running', 'succeeded', 'failed'];
const ROLES: readonly EndorserRole[] = ['celebrity', 'kol', 'expert'];

function counted(row: JsonRecord): Counted | null {
  const id = text(row.id);
  return id ? { id, films: count(row.films), brands: count(row.brands) } : null;
}

function rows<T>(value: unknown, read: (row: JsonRecord, base: Counted) => T | null): T[] {
  return list(value).flatMap((item) => {
    const row = record(item);
    const base = counted(row);
    const parsed = base ? read(row, base) : null;
    return parsed ? [parsed] : [];
  });
}


function readReadings(value: unknown, known: Set<string>): ReportReading[] {
  return list(value).flatMap((item) => {
    const reading = record(item);
    const statement = text(reading.statement);
    const refs = list(reading.refs).map(text).filter((ref) => known.has(ref));
    return statement && refs.length ? [{ statement, refs }] : [];
  });
}

export function readReport(value: StudioCompetitorReport | null | undefined): ReportView | null {
  if (!value) return null;
  const status = STATUSES.includes(value.status as ReportStatus) ? (value.status as ReportStatus) : 'failed';
  const inputs = record(value.inputs);
  const body = status === 'succeeded' ? record(value.report) : {};
  const formulas = rows(body.formulas, (row, base) =>
    text(row.template)
      ? { ...base, template: text(row.template), examples: list(row.examples).map(text).filter(Boolean),
          mechanisms: list(row.mechanisms).map(text).filter(Boolean), top: readTop(row.top), sources: readTop(row.sources) }
      : null,
  );
  const scenes = rows(inputs.scenes, (row, base) =>
    text(row.scene)
      ? { ...base, scene: text(row.scene), pain: text(row.pain), sellingPoint: text(row.sellingPoint),
          otherPoint: text(row.otherPoint) || null }
      : null,
  );
  const endorsers = rows(inputs.endorsers, (row, base) => {
    const role = text(row.role) as EndorserRole;
    return text(row.name) && ROLES.includes(role) ? { ...base, name: text(row.name), role } : null;
  });
  const structures = rows(inputs.structures, (row, base) =>
    text(row.name) ? { ...base, key: text(row.key), name: text(row.name) } : null,
  );
  const byId = <T extends Counted>(items: T[]) => new Map(items.map((item) => [item.id, item]));
  const [formulaOf, sceneOf, structureOf] = [byId(formulas), byId(scenes), byId(structures)];
  const ids = (items: Counted[]) => new Set(items.map((item) => item.id));
  const actions = list(body.next_actions).flatMap((item) => {
    const action = record(item);
    const description = text(action.description);
    return description
      ? [{
          id: text(action.id),
          priority: text(action.priority),
          structure: structureOf.get(text(action.structure)) ?? null,
          formula: formulaOf.get(text(action.formula)) ?? null,
          scene: sceneOf.get(text(action.scene)) ?? null,
          sellingPoints: text(action.selling_points),
          description,
        }]
      : [];
  });
  const sample = record(inputs.sample);
  const formulaStatus = text(body.formulaStatus);
  return {
    reportId: value.reportId,
    status,
    formulaStatus: formulaStatus === 'ok' || formulaStatus === 'fallback' ? formulaStatus : 'none',
    formulas,
    unassignedFilms: count(body.unassignedFilms),
    unassignedSources: readTop(body.unassignedSources),
    scenes,
    endorsers,
    structures,
    hookReadings: readReadings(body.hook_insights, ids(formulas)),
    sceneReadings: readReadings(body.scene_insights, ids(scenes)),
    endorserReadings: readReadings(body.endorser_insights, ids(endorsers)),
    goldenStructures: readReadings(body.golden_structures, ids(structures)),
    actions,
    limitations: list(body.limitations).map(text).filter(Boolean),
    sample: { films: count(sample.films), brands: count(sample.brands), enriched: count(sample.enriched) },
    modelId: value.modelId ?? null,
    costYuan: typeof value.costYuan === 'number' ? value.costYuan : null,
    createdAt: value.createdAt,
    finishedAt: value.finishedAt ?? null,
    errorMessage: value.errorMessage ?? null,
  };
}

export function readLatestReport(value: StudioCompetitorReportLatestResponse | undefined): LatestReport {
  const report = readReport(value?.report);
  const current = value?.currentInputSnapshot ?? null;
  return {
    report,
    stale: Boolean(value?.report && current && value.report.inputSnapshot !== current),
    films: typeof value?.films === 'number' ? value.films : null,
    minFilms: value?.minFilms ?? 10,
  };
}

export function isReportActive(report: ReportView | null): boolean {
  return report?.status === 'queued' || report?.status === 'running';
}
