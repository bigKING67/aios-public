import { describe, expect, it } from 'vitest';
import {
  elementComparison,
  elementsOf,
  formatOwnLane,
  formatOwnShare,
  formatShare,
  frequencyWord,
  patternDimension,
  readOwnStructures,
  readPatternPayload,
  structureComparison,
} from './competitor-patterns';

function row(dimension: string, label: string, numerator: number, denominator: number, family: [number, number], films: string[] = []) {
  return {
    dimension,
    label,
    numerator,
    denominator,
    partial_count: 1,
    unassessable_count: 0,
    blocked_count: 2,
    family_numerator: family[0],
    family_denominator: family[1],
    example_films: films,
  };
}

/** `films` decides the small-sample rule (since stats v2 it counts films, not opening families). */
function payload(films: number) {
  return readPatternPayload({
    sample: { films, families: films, statuses: { succeeded: 13, partial: 1 }, otherVersions: { v2: 1 }, unreadable: 0 },
    rows: [
      row('hook', 'problem_named', 6, 12, [3, 10], ['1', '2']),
      row('hook', 'result_first', 9, 12, [6, 10]),
      row('selling_point', 'long_wear', 8, 12, [5, 10], ['1']),
      row('selling_point', 'soft_focus', 4, 12, [4, 10]),
      row('selling_point', 'other', 2, 12, [2, 10]),
      row('selling_point_shown', 'long_wear', 5, 12, [3, 10]),
      row('opening_path', 'attention > problem > proof', 3, 12, [2, 10]),
      { dimension: 7, label: 'broken' },
    ],
    roleTime: { covered_sec: 100, unknown_gap_sec: 2, share: { claim: 0.2, attention: 0.5 } },
    text: { scenes: { denominator: 3, labels: [{ text: '通勤', films: 2, kinds: { shown: 2 }, example_films: ['1'] }, { films: 1 }] } },
    films: { '1': { analysisId: 'a1', title: '标题一' }, '2': { analysisId: 'a2', title: null } },
    labels: {
      hook_mechanisms: { problem_named: '问题点名（直接说出困扰或人群）', result_first: '结果先看（先给成妆或对比效果）' },
      selling_points: { long_wear: '持妆（含控油、不脱妆、不暗沉）', soft_focus: '柔焦妆效（磨皮）', other: '其他' },
      roles: { attention: '引起注意', problem: '激活问题', proof: '展示证据', claim: '表达主张' },
    },
  });
}

describe('competitor patterns read model', () => {
  it('reads a payload defensively', () => {
    const value = payload(12);
    expect(value.rows).toHaveLength(7);
    expect(value.text.scenes.labels).toEqual([{ text: '通勤', films: 2, kinds: { shown: 2 }, exampleFilms: ['1'] }]);
    expect(value.text.audiences).toEqual({ denominator: 0, labels: [] });
    expect(readPatternPayload(null).sample.films).toBe(0);
  });

  it('switches numerators and denominators by unit and sorts by count', () => {
    const film = patternDimension(payload(12), 'hook', 'film');
    expect(film.bars.map((bar) => [bar.name, bar.numerator, bar.denominator])).toEqual([
      ['结果先看', 9, 12],
      ['问题点名', 6, 12],
    ]);
    expect([film.denominator, film.partial, film.blocked]).toEqual([12, 1, 2]);
    const family = patternDimension(payload(12), 'hook', 'family');
    expect(family.bars[0]).toMatchObject({ numerator: 6, denominator: 10, rate: 0.6 });
    expect(family.bars[1].detail).toBe('问题点名（直接说出困扰或人群）');
    expect(family.bars[1].examples).toEqual([
      { awemeId: '1', analysisId: 'a1', title: '标题一' },
      { awemeId: '2', analysisId: 'a2', title: '抖音作品 2' },
    ]);
  });

  it('drops the percentage below ten films', () => {
    const bar = patternDimension(payload(9), 'hook', 'family').bars[0];
    expect(bar.rate).toBeNull();
    expect(formatShare(bar)).toBe('6/10');
    expect(formatShare(patternDimension(payload(10), 'hook', 'family').bars[0])).toBe('6/10 · 60%');
  });

  it('names opening paths by role', () => {
    expect(patternDimension(payload(12), 'opening_path', 'film').bars[0].name).toBe('引起注意 → 激活问题 → 展示证据');
  });

  it('keeps a denominator for dimensions without any label', () => {
    const value = readPatternPayload({
      sample: { films: 4, families: 3 },
      rows: [],
      dimensions: { trust_cues: { denominator: 4, family_denominator: 3, partial_count: 1, unassessable_count: 0, blocked_count: 0 } },
    });
    expect(patternDimension(value, 'trust_cues', 'family')).toEqual({ denominator: 3, partial: 1, unassessable: 0, blocked: 0, bars: [] });
    expect(patternDimension(value, 'trust_cues', 'film').denominator).toBe(4);
  });

  it('matches a selling-point set on both sides whatever order our side stored it in', () => {
    const lane = (rows: object[], families: number) => ({ films: families, families, empty: 0, rows });
    const payload = readPatternPayload({
      sample: { films: 12, families: 12 },
      structures: {
        films: 12, missing: 0, sales: { available: false, films: 0 },
        labels: { framework: {}, sellingPoint: { wear: '持妆', look: '妆效' } },
        labelOrder: { framework: [], sellingPoint: ['wear', 'look'] },
        framework: lane([], 0),
        sellingPoint: lane([{ key: 'wear + look', labels: ['wear', 'look'], films: 10, families: 10, sales: {}, exampleFilms: [] }], 12),
      },
    });
    const own = readOwnStructures({
      ownStructures: {
        framework: { assets: 0, labels: {}, rows: [] },
        sellingPoint: { assets: 12, labels: {}, rows: [{ labels: ['look', 'wear'], assets: 3 }] },
      },
    } as never);
    const [row] = structureComparison(payload, own, 'sellingPoint', 'families');
    // No spend data in the window: our side falls back to the count of originals.
    expect(row.ours).toEqual({ numerator: 3, denominator: 12, rate: 0.25, originals: 12 });
    expect(row.mark).toBeNull();
    expect(structureComparison(payload, null, 'sellingPoint', 'families')[0].ours).toBeNull();
    expect(readOwnStructures({} as never)).toBeNull();

    // With spend in the window, our side is the structure's share of the lane's spend (D16).
    const spent = readOwnStructures({
      ownStructures: {
        framework: { assets: 0, spend: 0, labels: {}, rows: [] },
        sellingPoint: { assets: 12, spend: 80_000, labels: {}, rows: [{ labels: ['look', 'wear'], assets: 3, spend: 20_000 }] },
        spendDays: { days: 30, synced: 30 },
      },
    } as never);
    const [byspend] = structureComparison(payload, spent, 'sellingPoint', 'families');
    expect(byspend.ours).toEqual({ numerator: 20_000, denominator: 80_000, rate: 0.25, spend: true, originals: 12 });
    expect(formatOwnShare(byspend.ours!)).toBe('¥2万 · 25%');
    expect(formatOwnLane(spent!.sellingPoint)).toBe('12 条原片 · ¥8万');
    expect(spent!.spendDays).toEqual({ days: 30, synced: 30 });
  });

  it('mirrors the worker elements and marks 我方没有 / 我方偏少 only with ten originals of ours', () => {
    expect(elementsOf('framework', ['mix', 'live', 'mix', 'deal']).map((e) => e.key)).toEqual([
      'has_mix', 'has_live', 'has_deal', 'first_mix', 'last_deal', 'steps_long',
    ]);
    expect(elementsOf('sellingPoint', ['wear', 'look']).map((e) => e.key)).toEqual(['has_wear', 'has_look', 'points_few']);
    expect([frequencyWord(9, 18), frequencyWord(6, 18), frequencyWord(5, 18)]).toEqual(['多数', '常见', '少数']);

    const lane = (rows: object[], elements: object[], families: number) => ({ films: families, families, empty: 0, rows, elements });
    const payload = readPatternPayload({
      sample: { films: 20, families: 20 },
      structures: {
        films: 20, missing: 0, sales: { available: false, films: 0 },
        labels: { framework: { street: '街采', live: '实拍内容' }, sellingPoint: {} },
        labelOrder: { framework: ['live', 'street'], sellingPoint: [] },
        framework: lane(
          [
            { key: 'street', labels: ['street'], films: 4, families: 2, brands: 3, sales: {}, exampleFilms: [] },
            { key: 'live', labels: ['live'], films: 2, families: 2, brands: 1, sales: {}, exampleFilms: [] },
          ],
          [
            { key: 'has_street', kind: 'has', label: 'street', films: 8, families: 8 },
            { key: 'has_live', kind: 'has', label: 'live', films: 5, families: 5 },
          ],
          20,
        ),
        sellingPoint: lane([], [], 0),
      },
    });
    const own = (assets: number) => readOwnStructures({
      ownStructures: {
        framework: { assets, labels: {}, rows: [{ labels: ['live'], assets }] },
        sellingPoint: { assets: 0, labels: {}, rows: [] },
      },
    } as never);
    // Elements count films: 8/20 street is 常见 and we have none; 5/20 live is 少数 (never marked).
    const ten = elementComparison(payload, own(10), 'framework');
    expect(ten.map((row) => [row.name, row.comp.numerator, row.mark])).toEqual([['含实拍内容', 5, null], ['含街采', 8, 'fewer']]);
    // Structures count films with their brands: street is 4/20 (20%) from 3 brands and ours is zero.
    const rows = structureComparison(payload, own(10), 'framework', 'families');
    expect(rows.map((row) => [row.name, row.comp?.numerator, row.comp?.brands, row.mark])).toEqual([
      ['街采', 4, 3, 'missing'],
      ['实拍内容', 2, 1, null],
    ]);
    // Below ten originals, or with no data of ours: the same numbers, no mark.
    expect(elementComparison(payload, own(5), 'framework').some((row) => row.mark)).toBe(false);
    expect(structureComparison(payload, own(5), 'framework', 'families')[0].mark).toBeNull();
    expect(structureComparison(payload, null, 'framework', 'families')[0].mark).toBeNull();
  });
});
