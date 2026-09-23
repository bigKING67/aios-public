import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCreatorLibraryXlsxFile } from './creator-library-api';
import { parseCreatorLibraryUpload } from './creator-library-csv';

vi.mock('./creator-library-api', () => ({
  parseCreatorLibraryXlsxFile: vi.fn(),
}));

const parseXlsxMock = vi.mocked(parseCreatorLibraryXlsxFile);

beforeEach(() => {
  parseXlsxMock.mockReset();
});

describe('parseCreatorLibraryUpload', () => {
  it('keeps CSV parsing local without calling the XLSX endpoint', async () => {
    const file = {
      name: 'creators.csv',
      type: 'text/csv',
      text: vi.fn().mockResolvedValue('平台,达人ID,达人昵称\n抖音,creator-001,测试达人'),
    } as unknown as File;

    const rows = await parseCreatorLibraryUpload(file);

    expect(parseXlsxMock).not.toHaveBeenCalled();
    expect(rows).toEqual([
      expect.objectContaining({
        platform: '抖音',
        influencerId: 'creator-001',
        influencerName: '测试达人',
        rowNumber: 2,
        error: undefined,
      }),
    ]);
  });

  it('uses backend XLSX rows and preserves frontend alias validation', async () => {
    const file = new File(['xlsx'], 'creators.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    parseXlsxMock.mockResolvedValue([
      ['平台', '达人id', '达人名称'],
      ['抖音', 'creator-002', '后端解析达人'],
      ['抖音', 'creator-003', ''],
    ]);

    const rows = await parseCreatorLibraryUpload(file);

    expect(parseXlsxMock).toHaveBeenCalledWith(file);
    expect(rows[0]).toEqual(expect.objectContaining({
      influencerId: 'creator-002',
      influencerName: '后端解析达人',
      rowNumber: 2,
      error: undefined,
    }));
    expect(rows[1]).toEqual(expect.objectContaining({
      influencerId: 'creator-003',
      rowNumber: 3,
      error: '达人昵称不能为空',
    }));
  });
});
