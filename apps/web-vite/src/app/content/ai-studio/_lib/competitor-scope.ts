import { useSearchParams } from 'react-router-dom';
import { labelOf, type CardLabels } from './competitor-card';
import { DEFAULT_PATTERN_CATEGORY } from './competitor-patterns';
import { type CalendarUnit, defaultPeriodSelection, type PeriodSelection, periodQuery } from './studio-period';

// Names before any snapshot exists; afterwards the snapshot's own dictionary names every category.
const FALLBACK_CATEGORY_NAMES: Record<string, string> = { all: '全部品类', [DEFAULT_PATTERN_CATEGORY]: '散粉' };

/** 爆款分析 opens on every category; a category in the URL narrows it. */
export const ALL_CATEGORY = 'all';

const CALENDAR_UNITS: readonly CalendarUnit[] = ['day', 'month', 'year'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Every URL key the period uses, including the retired `period` (last7 / last30 / all). */
const PERIOD_KEYS = ['unit', 'date', 'from', 'to', 'period'] as const;

/** The period in the URL: `from` + `to`, or `unit` with an optional `date`; anything else is 日 at yesterday. */
export function readPeriodSelection(params: URLSearchParams): PeriodSelection {
  const from = params.get('from');
  const to = params.get('to');
  if (from && to && ISO_DATE.test(from) && ISO_DATE.test(to)) return { unit: 'custom', from, to };
  const unit = CALENDAR_UNITS.find((value) => value === params.get('unit'));
  if (!unit) return defaultPeriodSelection();
  const date = params.get('date');
  return date && ISO_DATE.test(date) ? { unit, date } : { unit };
}

export function competitorCategoryName(key: string, labels: CardLabels | null): string {
  if (FALLBACK_CATEGORY_NAMES[key] && (key === 'all' || !labels)) return FALLBACK_CATEGORY_NAMES[key];
  return labels ? labelOf(labels, 'product_categories', key).replace(/、.*$/, '') : key;
}

/** Category and period of 爆款分析, kept in the URL so a view can be shared. */
export function useCompetitorScope() {
  const [params, setParams] = useSearchParams();
  const setParam = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const setSelection = (selection: PeriodSelection) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of PERIOD_KEYS) next.delete(key);
        for (const [key, value] of Object.entries(periodQuery(selection))) next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const selection = readPeriodSelection(params);
  return {
    params,
    setParam,
    setSelection,
    category: params.get('category') || ALL_CATEGORY,
    selection,
    period: periodQuery(selection),
  };
}

/**
 * 全部品类 first (it is also the default), then every category with films by film count, most first;
 * the current category stays listed even when its films are gone. A category whose films are all
 * gone keeps an empty snapshot and is not offered again otherwise.
 */
export function scopeCategoryKeys(category: string, categories: ReadonlyArray<{ key: string; films: number }>): string[] {
  const live = categories
    .filter((item) => item.key !== ALL_CATEGORY && item.films > 0)
    .sort((a, b) => b.films - a.films)
    .map((item) => item.key);
  return [...new Set([ALL_CATEGORY, ...live, category])];
}
