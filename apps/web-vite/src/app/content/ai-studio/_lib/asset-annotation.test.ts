import { describe, expect, it } from 'vitest';
import { buildContentAssetParams } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { readAnnotationFilter, resolveAnnotationPills } from './asset-annotation';

const summary = (overrides: Partial<{ suggestedCount: number; confirmedCount: number; suggestionActive: boolean }>) => ({
  assetId: 'a',
  suggestedCount: 0,
  confirmedCount: 0,
  suggestionActive: false,
  ...overrides,
});

describe('resolveAnnotationPills', () => {
  it('does not claim 未标注 before the summary loads', () => {
    expect(resolveAnnotationPills(undefined, true)).toEqual([{ label: '标注读取中', state: 'muted' }]);
  });

  it('reports unlabeled assets and a missing product', () => {
    expect(resolveAnnotationPills(summary({}), false).map((pill) => pill.label)).toEqual(['未标注', '未绑定产品']);
    // Confirmed segments carry their own product, so the original's missing product stops mattering.
    expect(resolveAnnotationPills(summary({ confirmedCount: 3 }), false).map((pill) => pill.label)).toEqual(['已确认 3 段']);
  });

  it('shows running AI, pending suggestions and confirmed counts together', () => {
    expect(resolveAnnotationPills(summary({ suggestionActive: true, suggestedCount: 2, confirmedCount: 3 }), true)).toEqual([
      { label: 'AI 分析中', state: 'active' },
      { label: '待确认 2', state: 'active' },
      { label: '已确认 3 段', state: 'ready' },
    ]);
  });
});

describe('annotation filter', () => {
  it('accepts only known values from the URL', () => {
    expect(readAnnotationFilter('confirmed')).toBe('confirmed');
    expect(readAnnotationFilter('bogus')).toBeUndefined();
    expect(readAnnotationFilter(null)).toBeUndefined();
  });

  it('forwards segmentStatus as segment_status and omits it when unset', () => {
    expect(buildContentAssetParams({ page: 1, pageSize: 20, sort: 'updated_desc', segmentStatus: 'unlabeled' }).segment_status).toBe('unlabeled');
    expect(buildContentAssetParams({ page: 1, pageSize: 20, sort: 'updated_desc' })).not.toHaveProperty('segment_status');
  });
});
