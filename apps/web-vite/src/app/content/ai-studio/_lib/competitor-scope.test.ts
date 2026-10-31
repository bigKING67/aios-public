import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_CATEGORY, readPeriodSelection, scopeCategoryKeys } from './competitor-scope';

afterEach(() => { vi.useRealTimers(); });

describe('competitor scope', () => {
  it('reads the period from the URL and falls back to 日 at yesterday', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T04:00:00Z'));
    const yesterday = { unit: 'day', date: '2026-10-27' };
    const read = (search: string) => readPeriodSelection(new URLSearchParams(search));
    expect(read('')).toEqual(yesterday);
    expect(read('period=last7')).toEqual(yesterday);
    expect(read('unit=day&date=2026-10-03')).toEqual({ unit: 'day', date: '2026-10-03' });
    expect(read('unit=year&date=bad')).toEqual({ unit: 'year' });
    expect(read('unit=week')).toEqual(yesterday);
    expect(read('from=2026-10-01&to=2026-10-09&unit=day')).toEqual({ unit: 'custom', from: '2026-10-01', to: '2026-10-09' });
    expect(read('from=2026-10-01')).toEqual(yesterday);
  });

  it('offers 全部品类 first, then categories with films by film count, keeping the current one', () => {
    const categories = [
      { key: 'all', films: 89 },
      { key: 'loose_powder', films: 11 },
      { key: 'cushion', films: 25 },
      { key: 'concealer', films: 2 },
      { key: 'lipstick', films: 0 },
    ];
    expect(scopeCategoryKeys(ALL_CATEGORY, categories)).toEqual(['all', 'cushion', 'loose_powder', 'concealer']);
    expect(scopeCategoryKeys('lipstick', categories)).toEqual(['all', 'cushion', 'loose_powder', 'concealer', 'lipstick']);
  });
});
