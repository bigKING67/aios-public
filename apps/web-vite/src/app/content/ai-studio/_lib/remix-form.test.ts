import { describe, expect, it } from 'vitest';
import { groupRemixCandidates, referenceAssetOptions } from './remix-form';

describe('referenceAssetOptions', () => {
  it('orders each asset structure by time, skips stale segments and picks the common product', () => {
    const options = referenceAssetOptions([
      { assetId: 'b', assetTitle: '整片-002', labelKey: 'demo', startMs: 5000, sourceCurrent: true },
      { assetId: 'a', assetTitle: '整片-001', labelKey: 'demo', startMs: 12700, sourceCurrent: true, productName: '精华' },
      { assetId: 'a', assetTitle: '整片-001', labelKey: 'voice', startMs: 0, sourceCurrent: true, productName: '精华', coverUrl: 'https://cdn.invalid/voice.webp' },
      { assetId: 'a', assetTitle: '整片-001', labelKey: 'tip', startMs: 30000, sourceCurrent: true, productName: '面霜' },
      { assetId: 'a', assetTitle: '整片-001', labelKey: 'street', startMs: 137000, sourceCurrent: false, productName: '面霜' },
    ]);
    expect(options).toEqual([
      { assetId: 'a', title: '整片-001', labels: ['voice', 'demo', 'tip'], productName: '精华', coverUrl: 'https://cdn.invalid/voice.webp' },
      { assetId: 'b', title: '整片-002', labels: ['demo'], productName: null, coverUrl: null },
    ]);
  });
});

describe('groupRemixCandidates', () => {
  const segment = (id: string, labelKey: string, extra: Record<string, unknown> = {}) => ({
    segmentId: id, assetId: 'a1', assetTitle: '整片-001', labelKey, startMs: 0, endMs: 5000, coverUrl: null,
    presetVersion: 2, productName: '精华', sourceCurrent: true, ...extra,
  });

  it('pools repeated labels and keeps only segments the server would use', () => {
    const groups = groupRemixCandidates(
      [
        { ordinal: 1, labelKey: 'voice', candidateCount: 2 },
        { ordinal: 2, labelKey: 'demo', candidateCount: 1 },
        { ordinal: 3, labelKey: 'voice', candidateCount: 2 },
      ],
      [
        segment('v2', 'voice', { assetTitle: '整片-002' }),
        segment('v1', 'voice', { startMs: 9000 }),
        segment('d1', 'demo'),
        segment('x-product', 'demo', { productName: '面霜' }),
        segment('x-version', 'demo', { presetVersion: 1 }),
        segment('x-stale', 'voice', { sourceCurrent: false }),
        segment('x-label', 'street'),
      ],
      '精华',
      2,
    );
    expect(groups.map((group) => [group.labelKey, group.ordinals, group.segments.map((item) => item.segmentId)])).toEqual([
      ['voice', [1, 3], ['v1', 'v2']],
      ['demo', [2], ['d1']],
    ]);
  });
});
