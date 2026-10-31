import { describe, expect, it } from 'vitest';
import type { StudioRemixBatchItem } from './remix-api';
import { remixBatchDeletedCount } from './remix-api';
import { isRemixItemPlaybackAvailable, remixRetentionText } from './remix-review';

const review: NonNullable<StudioRemixBatchItem['review']> = {
  decision: 'rejected',
  reasons: ['frame_drop'],
  note: null,
  reviewerUserId: 'u-1',
  reviewerName: '小王',
  reviewedAt: '2026-10-29T10:00:00+08:00',
};

function retention(status: string, extra: Partial<NonNullable<StudioRemixBatchItem['retention']>> = {}) {
  return {
    reason: 'rejected', status, cleanupAt: '2026-11-05T10:00:00+08:00', cleanedAt: null, canRestore: false,
    ...extra,
  };
}

describe('remix retention helpers', () => {
  it('does not label hidden rejected outputs as deleted files', () => {
    expect(remixBatchDeletedCount({ succeededCount: 2, availableCount: 1, rejectedCount: 1 })).toBe(0);
    expect(remixBatchDeletedCount({ succeededCount: 3, availableCount: 1, rejectedCount: 1 })).toBe(1);
  });
  it('explains deleting and completed rejections without losing their record', () => {
    expect(remixRetentionText({ review, retention: retention('deleting') })).toBe(
      '本地成片正在清理，已不能撤回；审核原因与来源记录仍会保留。',
    );
    expect(remixRetentionText({ review, retention: retention('completed', { cleanedAt: '2026-11-05T10:05:00+08:00' }) })).toBe(
      '本地成片已清理，不能撤回；审核原因与来源记录仍会保留。',
    );
  });

  it('allows cloud playback only for a successfully delivered cleanup, never a cleaned rejection', () => {
    const base = {
      outcome: 'succeeded', outputAssetId: 'out-1', outputDeleted: true,
      qc: { status: 'passed', reasons: [], freezeCount: 0, timestampGapCount: 0, duplicatePairCount: 0, maxAvOffsetMs: 0, sourceStatus: 'passed' },
      delivery: {
        status: 'succeeded', cloudVideoId: 'cloud-1', videoName: '成片 1', errorCode: null,
        attempts: 1, updatedAt: '2026-10-30T10:00:00+08:00', enabled: true, canRetry: false,
      },
    };
    expect(isRemixItemPlaybackAvailable({
      ...base,
      review: { ...review, decision: 'approved' },
      retention: { ...retention('completed'), reason: 'delivered' },
    })).toBe(true);
    expect(isRemixItemPlaybackAvailable({
      ...base,
      review,
      retention: retention('completed', { cleanedAt: '2026-11-05T10:05:00+08:00' }),
    })).toBe(false);
  });
});
