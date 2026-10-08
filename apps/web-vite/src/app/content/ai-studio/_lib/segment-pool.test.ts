import { describe, expect, it } from 'vitest';
import { buildSegmentPoolRows, poolScopeCounts } from './segment-pool';

const labels = [{ key: 'mixed_voiceover' }, { key: 'live_demo' }, { key: 'promotion' }];

describe('buildSegmentPoolRows', () => {
  it('groups by product, orders by volume and lists missing labels', () => {
    const rows = buildSegmentPoolRows(
      [
        { productName: '气垫', labelKey: 'mixed_voiceover', confirmedCount: 2 },
        { productName: null, labelKey: 'live_demo', confirmedCount: 4 },
        { productName: '洗发水', labelKey: 'mixed_voiceover', confirmedCount: 3 },
        { productName: '洗发水', labelKey: 'live_demo', confirmedCount: 1 },
      ],
      labels
    );
    expect(rows.map((row) => [row.productName, row.total, row.missingLabels])).toEqual([
      ['洗发水', 4, ['promotion']],
      ['气垫', 2, ['live_demo', 'promotion']],
      [null, 4, []],
    ]);
    expect(rows[0].counts).toEqual({ mixed_voiceover: 3, live_demo: 1 });
  });

  it('returns nothing for an empty pool', () => {
    expect(buildSegmentPoolRows([], labels)).toEqual([]);
  });
});

describe('poolScopeCounts', () => {
  const rows = buildSegmentPoolRows(
    [
      { productName: '面霜', labelKey: 'mixed_voiceover', confirmedCount: 8 },
      { productName: '面霜', labelKey: 'live_demo', confirmedCount: 4 },
      { productName: '精华', labelKey: 'mixed_voiceover', confirmedCount: 2 },
      { productName: null, labelKey: 'live_demo', confirmedCount: 1 },
    ],
    labels,
  );

  it('sums every product, one product or the product-less segments for the label strip', () => {
    expect(poolScopeCounts(rows, { kind: 'all' })).toEqual({ total: 15, counts: { mixed_voiceover: 10, live_demo: 5 } });
    expect(poolScopeCounts(rows, { kind: 'product', productName: '面霜' })).toEqual({
      total: 12,
      counts: { mixed_voiceover: 8, live_demo: 4 },
    });
    expect(poolScopeCounts(rows, { kind: 'withoutProduct' })).toEqual({ total: 1, counts: { live_demo: 1 } });
    expect(poolScopeCounts(rows, { kind: 'product', productName: '未知' })).toEqual({ total: 0, counts: {} });
  });
});
