import { describe, expect, it } from 'vitest';
import {
  readChartSpecs,
  resolveRank,
  resolveWords,
  statId,
  topStatIds,
} from './chart-spec';
import { readPatternPayload } from './competitor-patterns';

function row(dimension: string, label: string, numerator: number, family: number) {
  return {
    dimension,
    label,
    numerator,
    denominator: 12,
    family_numerator: family,
    family_denominator: 10,
    example_films: ['1'],
  };
}

const payload = readPatternPayload({
  sample: { films: 12, families: 10, statuses: { succeeded: 12 } },
  rows: [
    row('hook', 'result_first', 9, 6),
    row('hook', 'problem_named', 6, 3),
    row('hook', 'contrast', 2, 2),
    row('hook', 'trend', 1, 1),
    row('selling_point', 'long_wear', 8, 5),
    row('opening_path', 'attention > problem > proof', 3, 2),
  ],
  text: {
    scenes: { denominator: 9, labels: [1, 2, 3].map((n) => ({ text: `场景${n}`, films: 4 - n })) },
    audiences: { denominator: 9, labels: [] },
  },
  films: { '1': { analysisId: 'a1', title: '标题一' } },
  labels: { hook_mechanisms: { result_first: '结果先看', problem_named: '问题点名' } },
});

describe('chart spec validation', () => {
  it('accepts the three kinds and rejects malformed specs whole', () => {
    const { specs, rejected } = readChartSpecs([
      { kind: 'stat', title: '规模', metrics: ['analyzed', 'brands'] },
      { kind: 'rank', title: '钩子', statIds: ['loose_powder:hook:result_first'] },
      { kind: 'words', title: '场景', part: 'scenes', limit: 5 },
      { kind: 'pie', title: '饼图', statIds: [] },
      { kind: 'stat', title: '', metrics: ['analyzed'] },
      { kind: 'stat', title: '规模', metrics: ['analyzed', 'revenue'] },
      { kind: 'rank', title: '太多', statIds: Array.from({ length: 13 }, (_, i) => `c:d:${i}`) },
      { kind: 'words', title: '人群', part: 'brands' },
      'not a spec',
    ]);
    expect(specs.map((spec) => spec.kind)).toEqual(['stat', 'rank', 'words']);
    expect(rejected).toBe(6);
  });

  it('caps the number of specs and treats a non-list as one rejection', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: 'stat', title: `第${i}块`, metrics: ['analyzed'] }));
    expect(readChartSpecs(many)).toEqual({ specs: expect.any(Array), rejected: 8 });
    expect(readChartSpecs(many).specs).toHaveLength(12);
    expect(readChartSpecs({ kind: 'stat' })).toEqual({ specs: [], rejected: 1 });
    expect(readChartSpecs(null)).toEqual({ specs: [], rejected: 0 });
  });
});

describe('chart spec resolution', () => {
  it('takes every number from the snapshot and drops ids it cannot find', () => {
    const { bars, dropped } = resolveRank(
      {
        kind: 'rank',
        title: '钩子',
        statIds: [
          'loose_powder:hook:problem_named',
          'loose_powder:hook:result_first',
          'loose_powder:hook:made_up',
          'cushion:hook:result_first',
          'loose_powder:hook',
          'loose_powder:hook:problem_named',
        ],
      },
      payload,
      'loose_powder',
      'family',
    );
    expect(bars.map((bar) => [bar.key, bar.numerator, bar.denominator])).toEqual([
      ['problem_named', 3, 10],
      ['result_first', 6, 10],
    ]);
    expect(bars[0].name).toBe('问题点名');
    expect(dropped).toBe(4);
  });

  it('keeps labels that contain separators', () => {
    const id = statId('loose_powder', 'opening_path', 'attention > problem > proof');
    expect(resolveRank({ kind: 'rank', title: '路径', statIds: [id] }, payload, 'loose_powder', 'film').bars[0].numerator).toBe(3);
  });

  it('picks the top rows and limits free-text chips', () => {
    expect(topStatIds(payload, 'loose_powder', 'hook', 'family')).toEqual([
      'loose_powder:hook:result_first',
      'loose_powder:hook:problem_named',
      'loose_powder:hook:contrast',
    ]);
    expect(resolveWords({ kind: 'words', title: '场景', part: 'scenes', limit: 2 }, payload).labels.map((label) => label.text)).toEqual([
      '场景1',
      '场景2',
    ]);
  });
});
