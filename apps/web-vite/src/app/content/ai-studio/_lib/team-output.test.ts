import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  formatAmount,
  formatRoi,
  isSentinelTeam,
  parseDimension,
  qualityParts,
  shortDate,
  syncLine,
  type StudioTeamOutputResponse,
} from './team-output';

function response(overrides: Partial<StudioTeamOutputResponse['quality']> = {}): StudioTeamOutputResponse {
  return {
    quality: {
      uploadsWithoutDirector: 0,
      uploadsWithSeveralDirectors: 0,
      uploadsWithoutAuthor: 0,
      unmappedDirectorLabels: 0,
      spendWithoutGmv: 0,
      otherPlatformSpend: 0,
      ...overrides,
    },
  } as StudioTeamOutputResponse;
}

describe('team output formatting', () => {
  it('reads amounts in 万 above ten thousand and keeps cents only when asked', () => {
    expect(formatAmount(224602.77)).toBe('¥22.46 万');
    expect(formatAmount(1234.5)).toBe('¥1,235');
    expect(formatAmount(1234.5, true)).toBe('¥1,234.50');
  });

  it('shows ROI to two decimals and a dash without a denominator', () => {
    expect(formatRoi(1.5598)).toBe('1.56');
    expect(formatRoi(null)).toBe('—');
  });

  it('defaults the dimension to 剪辑', () => {
    expect(parseDimension(null)).toBe('editor');
    expect(parseDimension('director')).toBe('director');
    expect(parseDimension('owner')).toBe('editor');
  });

  it('treats labels without an account and 成片 without anyone as sentinel teams', () => {
    expect(isSentinelTeam({ kind: 'none' })).toBe(true);
    expect(isSentinelTeam({ kind: 'unmapped_label' })).toBe(true);
    expect(isSentinelTeam({ kind: 'unassigned' })).toBe(false);
  });
});

describe('team output notes', () => {
  it('says how fresh the data is and names the days not complete', () => {
    const base = { days: 3, spendDaysComplete: 2, uploadDaysComplete: 2 };
    expect(syncLine({ ...base, incompleteDays: [], latestCompleteDay: '2026-10-28' })).toEqual({
      text: '数据完整到 10/28',
      attention: false,
    });
    expect(syncLine({ ...base, incompleteDays: ['2026-10-27'], latestCompleteDay: '2026-10-28' }).text).toBe(
      '数据完整到 10/28 · 10/27未同步完整',
    );
    expect(
      syncLine({
        ...base,
        incompleteDays: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
        latestCompleteDay: '2026-10-28',
      }).text,
    ).toBe('数据完整到 10/28 · 10/1 等 4 天未同步完整');
    expect(syncLine({ ...base, incompleteDays: [], latestCompleteDay: null })).toEqual({
      text: '团队数据还没有同步',
      attention: true,
    });
    expect(shortDate('2026-10-05')).toBe('10/5');
  });

  it('lists only the caveats of the chosen dimension that apply', () => {
    const data = response({
      uploadsWithoutDirector: 3765,
      uploadsWithSeveralDirectors: 12,
      unmappedDirectorLabels: 6,
      spendWithoutGmv: 52.6,
      otherPlatformSpend: 5197.84,
    });
    expect(qualityParts(data, 'director')).toEqual([
      '3,765 条成片没有编导标签，归入「未归属」',
      '12 条成片有多位编导，每位各计 1 条，小组和团队合计只算 1 次',
      '6 个编导标签对不上账号，归入「未关联账号」',
      '¥53 千川消耗云管家未返回成交数据，计入消耗、不计入 ROI',
      '另有巨量广告、百度等其他平台消耗 ¥5,198，不计入任何数字',
    ]);
    expect(qualityParts(data, 'editor')).toEqual([
      '¥53 千川消耗云管家未返回成交数据，计入消耗、不计入 ROI',
      '另有巨量广告、百度等其他平台消耗 ¥5,198，不计入任何数字',
    ]);
    expect(qualityParts(response(), 'editor')).toEqual([]);
  });
});

describe('team output export file name', () => {
  it('reads the server name from filename* and falls back by kind', () => {
    const header =
      'attachment; filename="team-output.xlsx"; filename*=UTF-8\'\'%E5%9B%A2%E9%98%9F%E4%BA%A7%E5%87%BA.xlsx';
    expect(exportFileName(header, 'summary')).toBe('团队产出.xlsx');
    expect(exportFileName(undefined, 'videos')).toBe('团队产出_成片明细.xlsx');
    expect(exportFileName("attachment; filename*=UTF-8''%E0%A4", 'summary')).toBe('团队产出_汇总.xlsx');
  });
});
