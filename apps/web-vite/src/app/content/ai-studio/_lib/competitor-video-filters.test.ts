import { describe, expect, it, vi } from 'vitest';
import { readVideoFilters, changeVideoFilters } from './competitor-video-filters';

describe('catalogue URL context', () => {
  it('defaults to 日 at yesterday and a bounded server page', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-28T04:00:00Z'));
      expect(readVideoFilters(new URLSearchParams('source=unknown&page=-1')).query).toEqual({ unit: 'day', date: '2026-10-27', source: 'all', page: 1, pageSize: 20 });
    } finally {
      vi.useRealTimers();
    }
  });
  it('preserves the period when paging, and resets the page when filtering', () => {
    const original = new URLSearchParams('source=compass&unit=month&date=2026-09-01&page=3&analysis=a&video=v');
    const paged = changeVideoFilters(original, { page: 4 });
    expect(readVideoFilters(paged).query).toEqual({ source: 'compass', unit: 'month', date: '2026-09-01', page: 4, pageSize: 20 });
    expect(paged.has('analysis')).toBe(false);
    const custom = changeVideoFilters(paged, { selection: { unit: 'custom', from: '2026-09-01', to: '2026-09-03' } });
    expect(readVideoFilters(custom).query).toEqual({ source: 'compass', from: '2026-09-01', to: '2026-09-03', page: 1, pageSize: 20 });
    expect(custom.has('date')).toBe(false);
  });
});
