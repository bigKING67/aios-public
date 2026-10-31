import { describe, expect, it } from 'vitest';
import { batch } from '../_components/remix-outputs-fixtures';
import type { StudioSegmentPreset } from './ai-studio-api';
import { groupRemixBatchesForCurrentPage } from './remix-groups';

const PRESETS: StudioSegmentPreset[] = [
  {
    presetKey: 'framework',
    version: 1,
    status: 'active',
    dimension: 'framework',
    name: '框架 v1',
    labels: [
      { key: 'voice', name: '混剪口播', definition: '' },
      { key: 'demo', name: '实拍内容', definition: '' },
      { key: 'proof', name: '信任背书', definition: '' },
    ],
  },
];

describe('current remix page groups', () => {
  it('groups the supplied rows by Beijing date then structure without reordering batches', () => {
    const groups = groupRemixBatchesForCurrentPage(
      [
        batch({ batchId: 'new-a', createdAt: '2026-10-29T16:30:00Z' }),
        batch({ batchId: 'new-b', createdAt: '2026-10-30T00:00:00+08:00' }),
        batch({ batchId: 'new-c', createdAt: '2026-10-30T01:00:00+08:00', labels: ['voice', 'proof'] }),
        batch({ batchId: 'old-a', createdAt: '2026-10-29T15:30:00Z' }),
      ],
      PRESETS,
    );

    expect(groups.map((group) => group.dateKey)).toEqual(['2026-10-30', '2026-10-29']);
    expect(groups[0]?.dateLabel).toBe('2026 年 10 月 30 日');
    expect(groups[0]?.structures.map((group) => group.structure)).toEqual([
      '混剪口播 → 实拍内容',
      '混剪口播 → 信任背书',
    ]);
    expect(groups[0]?.structures[0]?.batches.map((row) => row.batchId)).toEqual(['new-a', 'new-b']);
    expect(groups[1]?.structures[0]?.batches.map((row) => row.batchId)).toEqual(['old-a']);
  });
});
