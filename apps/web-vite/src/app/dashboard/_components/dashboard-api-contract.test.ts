import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIOS_API_PATHS } from '@/lib/generated-api-contract';
import { request } from '@/lib/request';
import { fetchDashboardDateBounds } from './dashboard-date-bounds-fetcher';
import {
  createDashboardNote,
  deleteDashboardNote,
  fetchDashboardNoteCounts,
  updateDashboardNote,
} from './dashboard-notes-fetchers';

vi.mock('@/lib/request', () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const getMock = vi.mocked(request.get);
const postMock = vi.mocked(request.post);
const patchMock = vi.mocked(request.patch);
const deleteMock = vi.mocked(request.delete);

const abortController = new AbortController();
const noteRow = {
  id: 7,
  note_date: '2026-07-23',
  platform: 'douyin',
  metric_key: 'gmv',
  action_text: 'action',
  reason_text: 'reason',
  summary_text: 'summary',
  created_by: 'operator',
  updated_by: 'operator',
  created_at: '2026-07-23T00:00:00Z',
  updated_at: '2026-07-23T00:00:00Z',
};

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
});

describe('dashboard generated API contract', () => {
  it('uses the generated date-bounds path and rejects malformed responses', async () => {
    getMock
      .mockResolvedValueOnce({ minDate: '2026-01-01', maxDate: '2026-07-23' })
      .mockResolvedValueOnce({ minDate: 1, maxDate: null });

    await expect(fetchDashboardDateBounds(
      { platform: 'douyin', dimension: 'live' },
      { signal: abortController.signal, requestKey: 'date-bounds' },
    )).resolves.toEqual({ minDate: '2026-01-01', maxDate: '2026-07-23' });
    await expect(fetchDashboardDateBounds(
      { platform: 'douyin', dimension: 'live' },
      { signal: abortController.signal, requestKey: 'date-bounds-invalid' },
    )).rejects.toThrow('dashboard date bounds minDate must be a string');

    expect(getMock.mock.calls[0]?.[0]).toBe(AIOS_API_PATHS.dashboardDateBounds);
  });

  it('normalizes the generated notes read contract and fails closed on an invalid platform', async () => {
    getMock
      .mockResolvedValueOnce({
        startDate: '2026-07-01',
        endDate: '2026-07-23',
        platform: 'overview',
        includeRows: false,
        rows: [],
        countsByDate: { '2026-07-23': 2 },
      })
      .mockResolvedValueOnce({
        startDate: '2026-07-01',
        endDate: '2026-07-23',
        platform: 'unexpected',
        includeRows: false,
        rows: [],
        countsByDate: {},
      });

    const options = { signal: abortController.signal, requestKey: 'note-counts' };
    await expect(fetchDashboardNoteCounts({
      startDate: '2026-07-01',
      endDate: '2026-07-23',
      platform: 'overview',
    }, options)).resolves.toMatchObject({ countsByDate: { '2026-07-23': 2 } });
    await expect(fetchDashboardNoteCounts({
      startDate: '2026-07-01',
      endDate: '2026-07-23',
      platform: 'overview',
    }, options)).rejects.toThrow('Unsupported dashboard notes platform: unexpected');

    expect(getMock.mock.calls[0]?.[0]).toBe(AIOS_API_PATHS.dashboardNotes);
  });

  it('keeps every notes mutation on generated paths with retries disabled', async () => {
    postMock.mockResolvedValue(noteRow);
    patchMock.mockResolvedValue({ ...noteRow, summary_text: 'updated' });
    deleteMock.mockResolvedValue(undefined);

    await createDashboardNote({
      noteDate: '2026-07-23',
      platform: 'douyin',
      metricKey: 'gmv',
      actionText: 'action',
      reasonText: 'reason',
      summaryText: 'summary',
    });
    await updateDashboardNote(7, {
      metricKey: 'gmv',
      actionText: 'action',
      reasonText: 'reason',
      summaryText: 'updated',
    });
    await deleteDashboardNote(7);

    expect(postMock).toHaveBeenCalledWith(
      AIOS_API_PATHS.dashboardNotes,
      expect.objectContaining({ note_date: '2026-07-23', platform: 'douyin' }),
      expect.objectContaining({ retryMode: 'never' }),
    );
    expect(patchMock).toHaveBeenCalledWith(
      AIOS_API_PATHS.dashboardNote(7),
      expect.objectContaining({ summary_text: 'updated' }),
      expect.objectContaining({ retryMode: 'never' }),
    );
    expect(deleteMock).toHaveBeenCalledWith(
      AIOS_API_PATHS.dashboardNote(7),
      expect.objectContaining({ retryMode: 'never' }),
    );
  });

  it('rejects overview as a write platform before transport', async () => {
    await expect(createDashboardNote({
      noteDate: '2026-07-23',
      platform: 'overview',
      metricKey: null,
      actionText: 'action',
      reasonText: 'reason',
      summaryText: 'summary',
    })).rejects.toThrow('Dashboard notes require a concrete platform');
    expect(postMock).not.toHaveBeenCalled();
  });
});
