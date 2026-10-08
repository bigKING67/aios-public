import { describe, expect, it } from 'vitest';
import type { StudioSegmentPreset } from './ai-studio-api';
import { dimensionCopy, groupPresetsByDimension } from './analysis-dimension';

const preset = (presetKey: string, version: number, dimension: string, status = 'active') =>
  ({ presetKey, version, dimension, name: presetKey, labels: [], status }) as StudioSegmentPreset;

describe('groupPresetsByDimension', () => {
  it('orders dimensions framework → picture and versions newest first, dropping retired presets', () => {
    const groups = groupPresetsByDimension([
      preset('picture', 1, 'picture'),
      preset('framework', 1, 'framework'),
      preset('framework', 2, 'framework'),
      preset('framework', 3, 'framework', 'retired'),
    ]);
    expect(groups.map((group) => [group.dimension, group.presets.map((item) => item.version)])).toEqual([
      ['framework', [2, 1]],
      ['picture', [1]],
    ]);
  });

  it('treats unknown dimensions as custom', () => {
    expect(groupPresetsByDimension([preset('x', 1, 'mystery')])[0].dimension).toBe('custom');
    expect(dimensionCopy('mystery').labelNoun).toBe('类别');
    expect(dimensionCopy('picture').labelNoun).toBe('画面类型');
  });
});
