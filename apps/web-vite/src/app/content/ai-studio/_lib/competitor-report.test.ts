import { describe, expect, it } from 'vitest';
import { readBreakdown } from './competitor-breakdown';
import { readLatestReport, readReport, shortTitle } from './competitor-report';
import { reportFixture } from './competitor-report-fixtures';

describe('competitor report read model (v12)', () => {
  it('reads formulas, readings and actions with counts only from stored rows', () => {
    const report = readReport(reportFixture())!;
    expect(report.formulaStatus).toBe('ok');
    expect(report.formulas.map((f) => [f.id, f.template, f.films, f.brands])).toEqual([['f1', '[人群]别再[错误做法]了', 31, 9]]);
    expect(report.formulas[0].top[0]).toEqual({ awemeId: '7000000001', salesMin: 250000, salesMax: 500000, opening: '干皮姐妹别再用控油散粉了', openingKind: undefined, evidence: [] });
    expect(report.formulas[0].sources).toHaveLength(31);
    expect(report.formulas[0].sources[0]).toMatchObject({ openingKind: 'onscreen_text', evidence: [{ start: 0, end: 2.6 }] });
    expect(report.hookReadings).toEqual([{ statement: '点名人群再纠错，适合讲持妆', refs: ['f1'] }]);
    // A citation without a row is dropped; a reading left with none is dropped whole.
    expect(report.sceneReadings).toEqual([{ statement: '赶时间出门是主打场景', refs: ['s1'] }]);
    expect(report.goldenStructures[0].refs).toEqual(['k1']);
    const [action] = report.actions;
    expect([action.structure?.name, action.formula?.template, action.scene?.scene, action.sellingPoints]).toEqual([
      '混剪口播 → 实拍内容 → 机制', '[人群]别再[错误做法]了', '早上赶时间', '妆效 + 持妆',
    ]);
    expect(report.sample).toEqual({ films: 140, brands: 35, enriched: 120 });
  });

  it('shows nothing for a failed report and keeps its reason', () => {
    const report = readReport(reportFixture({ status: 'failed', errorMessage: '拆解没有通过校验' }))!;
    expect([report.formulas, report.actions, report.hookReadings]).toEqual([[], [], []]);
    expect(report.errorMessage).toBe('拆解没有通过校验');
  });

  it('marks a report made for an older snapshot as stale and reads the film threshold', () => {
    const base = { category: 'loose_powder', period: 'last30', films: 140, minFilms: 10 };
    expect(readLatestReport({ ...base, report: reportFixture(), currentInputSnapshot: 'snap-b' }).stale).toBe(true);
    expect(readLatestReport({ ...base, report: reportFixture(), currentInputSnapshot: 'snap-a' }).stale).toBe(false);
    expect(readLatestReport({ ...base, report: null, currentInputSnapshot: 'snap-a' })).toMatchObject({
      report: null, stale: false, films: 140, minFilms: 10,
    });
  });

  it('shortens a film title to its text before the hashtags', () => {
    expect(shortTitle('持妆实测 #气垫')).toBe('持妆实测');
    expect(shortTitle('换季换底妆，直接锁死蒂洛薇保湿气垫，清透扒脸水光质感')).toBe('换季换底妆，直接锁死蒂洛薇保湿气垫，…');
    expect(shortTitle('#只有话题')).toBe('#只有话题');
  });
});

describe('breakdown read model', () => {
  it('reads the three blocks defensively and is null on older snapshots', () => {
    expect(readBreakdown(undefined)).toBeNull();
    const breakdown = readBreakdown({
      films: 140, enriched: 100, brands: { brands: 35, unknown: 4 }, sales: { available: true },
      hook: { films: 130, groups: 60, rows: [{ group: '7000000001', text: '干皮姐妹别再用控油散粉了', mechanisms: ['problem_named'], films: 12, brands: 3, top: [{ film: '7000000001', salesMin: null }] }, { text: 'no group' }] },
      scene: { films: 100, rows: [{ key: '通勤|long_wear', scene: '通勤', pain: '出油脱妆', sellingPoint: 'long_wear', otherPoint: null, audiences: ['油皮'], text: '上班路上妆花了', films: 22, brands: 8, top: [] }] },
      endorser: { films: 100, unnamed: { kol: { films: 7, brands: 4 }, bogus: { films: 1 } }, other: { films: 30, brands: 12, cues: { sales_data: 20 } },
        rows: [{ key: '何泓姗', name: '何泓姗', role: 'celebrity', films: 19, brands: 3, top: [] }, { key: 'x', name: 'x', role: 'fan' }] },
    })!;
    expect(breakdown.hook.rows).toHaveLength(1);
    expect(breakdown.hook.rows[0].top).toEqual([{ awemeId: '7000000001', salesMin: null, salesMax: null, opening: null, openingKind: undefined, evidence: [] }]);
    expect(breakdown.scene.rows[0].audiences).toEqual(['油皮']);
    expect(breakdown.endorser.unnamed).toEqual({ kol: { films: 7, brands: 4 } });
    expect(breakdown.endorser.rows.map((row) => row.name)).toEqual(['何泓姗']);
    expect(breakdown.salesAvailable).toBe(true);
  });
});
