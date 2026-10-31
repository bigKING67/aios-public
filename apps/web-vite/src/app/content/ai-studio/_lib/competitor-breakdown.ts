/**
 * 爆款拆解 read model of the snapshot's `breakdown` (competitor_analysis/breakdown.py): opening groups,
 * scene → pain → selling point rows and endorsers. Counts are films (a re-posted material counts each
 * time) with the brands behind them; each row names its TOP5 films by 关联直播间销售额, one per material.
 * Snapshots written before breakdown existed read as null and the page says the new statistics are coming.
 */

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

function money(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export interface TopFilm {
  awemeId: string;
  /** 罗盘 band sums of the rooms the film drove traffic to; null when it has no 罗盘 data. */
  salesMin: number | null;
  salesMax: number | null;
  opening: string | null;
  openingKind?: 'speech' | 'onscreen_text';
  evidence?: { start: number; end: number }[];
}

export interface BreakdownCount {
  films: number;
  brands: number;
}

export interface BreakdownRow extends BreakdownCount {
  key: string;
  top: TopFilm[];
}

export interface HookRow extends BreakdownRow {
  text: string;
  mechanisms: string[];
}

export interface SceneRow extends BreakdownRow {
  scene: string;
  pain: string;
  sellingPoint: string;
  otherPoint: string | null;
  audiences: string[];
  text: string | null;
}

export type EndorserRole = 'celebrity' | 'kol' | 'expert';

export interface EndorserRow extends BreakdownRow {
  name: string;
  role: EndorserRole;
}

export interface Breakdown {
  films: number;
  /** Films whose scene and endorser extraction has finished. */
  enriched: number;
  brands: { brands: number; unknown: number };
  salesAvailable: boolean;
  hook: { films: number; groups: number; rows: HookRow[] };
  scene: { films: number; rows: SceneRow[] };
  endorser: {
    films: number;
    unnamed: Partial<Record<EndorserRole, BreakdownCount>>;
    other: BreakdownCount & { cues: Record<string, number> };
    rows: EndorserRow[];
  };
}

export const SCENE_POINT_NAMES: Readonly<Record<string, string>> = {
  moisturizing: '滋润保湿',
  skincare: '养肤护肤',
  no_caking: '妆效',
  long_wear: '持妆',
};
export const ENDORSER_ROLE_NAMES: Readonly<Record<EndorserRole, string>> = {
  celebrity: '明星',
  kol: 'KOL达人',
  expert: '化妆师或专家',
};
const ROLES = Object.keys(ENDORSER_ROLE_NAMES) as EndorserRole[];
/** Rows shown per block; the rest stay out of the page. */
export const BREAKDOWN_TOP = 5;

function readCount(value: unknown): BreakdownCount {
  const item = record(value);
  return { films: count(item.films), brands: count(item.brands) };
}

export function readTop(value: unknown): TopFilm[] {
  return list(value).flatMap((item) => {
    const film = record(item);
    const awemeId = text(film.film);
    return awemeId
      ? [{ awemeId, salesMin: money(film.salesMin), salesMax: money(film.salesMax), opening: text(film.opening) || null,
          openingKind: film.openingKind === 'speech' ? 'speech' as const : film.openingKind === 'onscreen_text' ? 'onscreen_text' as const : undefined,
          evidence: list(film.evidence).flatMap((value) => {
            const item = record(value);
            return typeof item.start === 'number' && typeof item.end === 'number' && item.start >= 0 && item.end >= item.start
              ? [{ start: item.start, end: item.end }] : [];
          }) }]
      : [];
  });
}

function readRows<T>(value: unknown, read: (item: JsonRecord) => T | null): T[] {
  return list(value).flatMap((item) => {
    const row = read(record(item));
    return row ? [row] : [];
  });
}

export function readBreakdown(value: unknown): Breakdown | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const breakdown = record(value);
  const hook = record(breakdown.hook);
  const scene = record(breakdown.scene);
  const endorser = record(breakdown.endorser);
  const brands = record(breakdown.brands);
  const other = record(endorser.other);
  const unnamed: Breakdown['endorser']['unnamed'] = {};
  for (const role of ROLES) {
    const entry = record(endorser.unnamed)[role];
    if (entry) unnamed[role] = readCount(entry);
  }
  return {
    films: count(breakdown.films),
    enriched: count(breakdown.enriched),
    brands: { brands: count(brands.brands), unknown: count(brands.unknown) },
    salesAvailable: record(breakdown.sales).available === true,
    hook: {
      films: count(hook.films),
      groups: count(hook.groups),
      rows: readRows(hook.rows, (row) =>
        text(row.group) && text(row.text)
          ? { key: text(row.group), text: text(row.text), mechanisms: list(row.mechanisms).map(text).filter(Boolean),
              ...readCount(row), top: readTop(row.top) }
          : null,
      ),
    },
    scene: {
      films: count(scene.films),
      rows: readRows(scene.rows, (row) =>
        text(row.key) && text(row.scene)
          ? {
              key: text(row.key),
              scene: text(row.scene),
              pain: text(row.pain),
              sellingPoint: text(row.sellingPoint),
              otherPoint: text(row.otherPoint) || null,
              audiences: list(row.audiences).map(text).filter(Boolean),
              text: text(row.text) || null,
              ...readCount(row),
              top: readTop(row.top),
            }
          : null,
      ),
    },
    endorser: {
      films: count(endorser.films),
      unnamed,
      other: { ...readCount(other), cues: Object.fromEntries(Object.entries(record(other.cues)).map(([k, v]) => [k, count(v)])) },
      rows: readRows(endorser.rows, (row) => {
        const role = text(row.role) as EndorserRole;
        return text(row.key) && text(row.name) && ROLES.includes(role)
          ? { key: text(row.key), name: text(row.name), role, ...readCount(row), top: readTop(row.top) }
          : null;
      }),
    },
  };
}

/** The selling point a scene row answers its pain with. */
export function scenePointName(row: Pick<SceneRow, 'sellingPoint' | 'otherPoint'>): string {
  return SCENE_POINT_NAMES[row.sellingPoint] ?? row.otherPoint ?? '其他卖点';
}

/** "31/140 条 · 9 个品牌": the films using it out of the window's films, and the brands behind them. */
export function formatFilmShare(row: BreakdownCount, films: number): string {
  return `${row.films}/${films} 条 · ${row.brands} 个品牌`;
}
