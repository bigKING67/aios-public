import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { AIOS_API_PATHS } from '@/lib/generated-api-contract';
import {
  buildCreatorLibraryParams,
  fetchCreatorLibraryFilterOptions,
  normalizeCreatorLibraryOwnershipType,
  parseCreatorLibraryXlsxFile,
} from './creator-library-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const getMock = vi.mocked(apiClient.get);
const postMock = vi.mocked(apiClient.post);

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

describe('creator library API contract', () => {
  it('maps UI filters to the validated backend query names', () => {
    expect(buildCreatorLibraryParams({
      keyword: 'serum',
      platform: '抖音',
      anchorTags: ['美妆', '', '成分党'],
      ownerUserId: 'user-1',
      ownerName: 'ignored-owner-name',
      ownershipScope: 'mine',
      mcnStatus: 'registered',
      page: 2,
      pageSize: 50,
      sort: 'fans_desc',
    }, {
      includeFilterOptions: false,
      includeSummary: true,
    })).toEqual({
      keyword: 'serum',
      platform: '抖音',
      anchor_tags: '美妆,成分党',
      owner_user_id: 'user-1',
      ownership: 'mine',
      mcn_status: 'registered',
      include_filter_options: 'false',
      include_summary: 'true',
      page: 2,
      page_size: 50,
      sort: 'fans_desc',
    });
  });

  it('uses the generated gateway-relative path for filter options', async () => {
    const filterOptions = {
      platforms: ['抖音'],
      categories: ['美妆'],
      anchorTags: ['成分党'],
      anchorLevels: ['A-头部'],
      cooperationStatuses: ['已合作'],
      owners: ['BD-1'],
      bdUsers: [],
      sourceTypes: ['manual'],
    };
    getMock.mockResolvedValue({ data: filterOptions } as Awaited<ReturnType<typeof apiClient.get>>);

    await expect(fetchCreatorLibraryFilterOptions()).resolves.toEqual(filterOptions);
    expect(getMock).toHaveBeenCalledWith(`${AIOS_API_PATHS.creatorLibrary}/filter-options`);
  });

  it('fails closed on an unexpected ownership type', () => {
    expect(normalizeCreatorLibraryOwnershipType('public_seed')).toBe('public_seed');
    expect(() => normalizeCreatorLibraryOwnershipType('unexpected'))
      .toThrow('Unsupported creator library ownership type: unexpected');
  });
});

describe('parseCreatorLibraryXlsxFile', () => {
  it('uploads the XLSX as multipart data and returns typed raw rows', async () => {
    const file = new File(['xlsx'], 'creators.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    postMock.mockResolvedValue({
      data: { rows: [['达人ID'], ['creator-001']] },
    } as Awaited<ReturnType<typeof apiClient.post>>);

    const rows = await parseCreatorLibraryXlsxFile(file);

    expect(rows).toEqual([['达人ID'], ['creator-001']]);
    expect(postMock).toHaveBeenCalledOnce();
    const [path, body, config] = postMock.mock.calls[0];
    expect(path).toBe(AIOS_API_PATHS.creatorLibraryParseXlsx);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(config).toEqual({ retryMode: 'never' });
  });
});
