import { describe, expect, it } from 'vitest';
import { applyProductionCommand, moveProductionClip } from './content-production-edit';
import type { ProductionClip } from './content-production-api';
const clips: ProductionClip[] = [1, 2].map(i => ({ id: `c${i}`, assetId: `asset${i}`, startMs: 1000, endMs: 3000, caption: `字幕${i}`, volume: 1 }));
describe('production edits', () => {
  it('moves full clips without changing their source time or subtitle', () => {
    const changed = applyProductionCommand(clips, '把第2段移到开头');
    expect(changed.clips).toEqual([clips[1], clips[0]]);
    expect(clips[0].id).toBe('c1');
  });
  it('rejects unknown commands and invalid indexes', () => {
    expect(() => applyProductionCommand(clips, '随便剪一个爆款')).toThrow('暂支持');
    expect(() => applyProductionCommand(clips, '删除第9段')).toThrow('找不到');
    expect(() => moveProductionClip(clips, -1, 0)).toThrow();
  });
  it('mutes only the named clip and deletes explicitly', () => {
    expect(applyProductionCommand(clips, '第2段静音').clips.map(c => c.volume)).toEqual([1, 0]);
    expect(applyProductionCommand(clips, '删除第1段').clips).toEqual([clips[1]]);
  });
});
