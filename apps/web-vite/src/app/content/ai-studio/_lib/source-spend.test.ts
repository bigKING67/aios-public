import { describe, expect, it } from 'vitest';
import {
  frozenAdmissionSummary,
  sourceSpendCoverage,
  sourceSpendLabel,
  type SourceSpendSnapshot,
} from './source-spend';

function spend(extra: Partial<SourceSpendSnapshot> = {}): SourceSpendSnapshot {
  return {
    spend30d: 0,
    class: 'low',
    asOf: '2026-10-29',
    complete: true,
    syncedDays: 30,
    windowDays: 30,
    ...extra,
  };
}

describe('source spend display', () => {
  it('keeps zero, the admission threshold and unknown data distinct', () => {
    expect(sourceSpendLabel(spend())).toBe('低消耗 ¥0');
    expect(sourceSpendLabel(spend({ spend30d: 5_000, class: 'qualified' }))).toBe('达标 ¥5,000');
    expect(sourceSpendLabel(spend({ spend30d: null, class: 'unknown' }))).toBe('无数据');
    expect(sourceSpendLabel(null)).toBe('无数据');
  });

  it('keeps a partial-window amount as a known subtotal without changing the unknown class', () => {
    const partial = spend({ spend30d: 82_900, class: 'unknown', complete: false, syncedDays: 18 });
    expect(sourceSpendLabel(partial)).toBe('无数据');
    expect(sourceSpendCoverage(partial)).toBe('消耗只同步了 18/30 天 · 已知小计 ¥8.3万');
    expect(sourceSpendCoverage(partial, true)).toBe('消耗 18/30 天 · 小计 ¥8.3万');
  });

  it('states missing-day coverage without inventing a subtotal when no amount is known', () => {
    expect(sourceSpendCoverage(spend({ spend30d: null, class: 'unknown', complete: false, syncedDays: 23 })))
      .toBe('消耗只同步了 23/30 天');
    expect(sourceSpendCoverage(spend())).toBeNull();
  });
});

describe('frozen admission summary', () => {
  it('counts unknown sources with low-spend for the admission rule', () => {
    expect(frozenAdmissionSummary([
      { spendClass: 'qualified' },
      { spendClass: 'low' },
      { spendClass: 'unknown' },
    ])).toEqual({ qualified: 1, low: 2, label: '达标 1 段 · 低消耗 2 段' });
  });

  it('stays hidden for old or partially frozen outputs', () => {
    expect(frozenAdmissionSummary([{ spendClass: 'qualified' }, {}])).toBeNull();
    expect(frozenAdmissionSummary([])).toBeNull();
  });
});
