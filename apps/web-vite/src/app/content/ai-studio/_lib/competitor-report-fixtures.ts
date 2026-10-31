/** Test data for the 爆款拆解 report (v12): a succeeded report with one citation of a row that is not there. */
import type { StudioCompetitorReport } from '@/lib/generated-api-contract';

export function reportFixture(overrides: Partial<StudioCompetitorReport> = {}): StudioCompetitorReport {
  return {
    reportId: 'r1',
    category: 'loose_powder',
    period: 'last30',
    inputSnapshot: 'snap-a',
    promptVersion: 'competitor-report-b-v13-semantic',
    status: 'succeeded',
    modelId: 'doubao-seed-2-1-lite-260915',
    inputs: {
      promptVersion: 'competitor-report-b-v13-semantic',
      sample: { films: 140, brands: 35, enriched: 120 },
      scenes: [{ id: 's1', films: 22, brands: 8, top: [], scene: '早上赶时间', pain: '不想化妆、着急出门', sellingPoint: 'no_caking', otherPoint: null }],
      endorsers: [{ id: 'e1', films: 19, brands: 3, top: [], name: '何泓姗', role: 'celebrity' }],
      structures: [{ id: 'k1', key: 'mix > live > deal', name: '混剪口播 → 实拍内容 → 机制', films: 40, brands: 12 }],
      films: { '7000000001': { analysisId: 'a1', title: '持妆实测，一整天不脱妆的气垫真的有吗 #气垫 #底妆' } },
    },
    report: {
      formulaStatus: 'ok',
      formulas: [{
        id: 'f1', template: '[人群]别再[错误做法]了', examples: ['干皮姐妹别再用控油散粉了'], mechanisms: ['problem_named'],
        sources: Array.from({ length: 31 }, (_, index) => ({ film: String(7000000001 + index),
          opening: index === 0 ? '干皮姐妹别再用控油散粉了' : `来源开头文案 ${index + 1}`,
          openingKind: index === 0 ? 'onscreen_text' : 'speech', evidence: [{ start: 0, end: 2.6 }], salesMin: 250000, salesMax: 500000 })),
        films: 31, brands: 9, top: [{ film: '7000000001', salesMin: 250000, salesMax: 500000, opening: '干皮姐妹别再用控油散粉了' }],
      }],
      hook_insights: [{ refs: ['f1'], statement: '点名人群再纠错，适合讲持妆' }],
      scene_insights: [{ refs: ['s1', 's9'], statement: '赶时间出门是主打场景' }, { refs: ['s9'], statement: '引用不存在的行' }],
      endorser_insights: [],
      golden_structures: [{ refs: ['k1'], statement: '先混剪口播再上实拍，机制放最后' }],
      next_actions: [{
        id: 'a1', priority: 'now', structure: 'k1', formula: 'f1', scene: 's1', selling_points: '妆效 + 持妆',
        description: '拍一条早上三分钟出门的对比',
      }],
      limitations: ['没有我方数据'],
    },
    issues: [],
    costYuan: 0.081,
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-10-29T02:00:00Z',
    finishedAt: '2026-10-29T02:02:00Z',
    ...overrides,
  } as StudioCompetitorReport;
}
