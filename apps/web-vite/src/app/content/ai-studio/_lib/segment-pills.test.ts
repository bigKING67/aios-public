import { describe, expect, it } from 'vitest';
import type { StudioContentSegment } from './ai-studio-api';
import { resolveSegmentPills } from './segment-pills';

const base = {
  segmentId: 's',
  ownerUserId: 'u',
  assetId: 'a',
  assetTitle: '原片',
  sourceContentHash: 'h',
  sourceCurrent: true,
  sourceDurationMs: 60_000,
  startMs: 0,
  endMs: 5_000,
  presetKey: 'framework',
  presetVersion: 1,
  labelKey: 'mixed_voiceover',
  productName: '气垫',
  origin: 'ai',
  status: 'confirmed',
  evidence: null,
  revision: 1,
  confirmedBy: null,
  confirmedAt: null,
  createdAt: '',
  updatedAt: '',
} as unknown as StudioContentSegment;

const labels = (overrides: Partial<StudioContentSegment>) =>
  resolveSegmentPills({ ...base, ...overrides } as StudioContentSegment).map((pill) => `${pill.label}:${pill.state}`);

describe('resolveSegmentPills', () => {
  it('marks confirmed segments with a product as ready', () => {
    expect(labels({})).toEqual(['已确认:ready', 'AI:muted']);
  });

  it('flags a missing product as a remix blocker', () => {
    expect(labels({ productName: null, status: 'suggested', origin: 'human' })).toEqual([
      '待确认:active',
      '人工:muted',
      '缺产品，无法混剪:failed',
    ]);
  });

  it('does not ask rejected or stale segments for a product', () => {
    expect(labels({ productName: '', status: 'rejected' })).not.toContain('缺产品，无法混剪:failed');
    expect(labels({ productName: null, sourceCurrent: false })[0]).toMatch(/:failed$/);
  });
});
