import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIOS_API_PATHS } from '@/lib/generated-api-contract';
import { request } from '@/lib/request';

import {
  getAllMonthlyPeriods,
  getMonthlyReport,
} from './monthly';
import {
  generateSummary,
  getSummaryStatus,
  updateSummary,
} from './summary';
import {
  getAllWeeklyPeriods,
  getWeeklyReport,
} from './weekly';

vi.mock('@/config/weekly-summary-ai', () => ({
  getWeeklySummaryAIConfig: () => ({}),
}));

vi.mock('@/lib/request', () => ({
  APIError: class APIError extends Error {},
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const getMock = vi.mocked(request.get);
const postMock = vi.mocked(request.post);
const putMock = vi.mocked(request.put);

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
});

describe('reports generated API contract', () => {
  it('uses generated weekly and monthly read paths', async () => {
    getMock
      .mockResolvedValueOnce({ metadata: {}, kpis: [], charts: {}, conclusions: {} })
      .mockResolvedValueOnce({ periods: [{ value: '2026/07/01~2026/07/07', label: 'week' }] })
      .mockResolvedValueOnce({ metadata: {}, kpis: [], charts: {}, conclusions: {} })
      .mockResolvedValueOnce({ periods: [{ value: '2026-07', label: 'month' }] });

    await getWeeklyReport(undefined, '2026/07/01~2026/07/07');
    await getAllWeeklyPeriods();
    await getMonthlyReport(undefined, '2026-07');
    await getAllMonthlyPeriods();

    expect(getMock.mock.calls.map(([path]) => path)).toEqual([
      AIOS_API_PATHS.reportWeeklyByPeriod,
      AIOS_API_PATHS.reportWeeklyAllPeriods,
      AIOS_API_PATHS.reportMonthlyByPeriod,
      AIOS_API_PATHS.reportMonthlyAllPeriods,
    ]);
  });

  it('encodes report path identifiers inside the generated facade', () => {
    expect(AIOS_API_PATHS.reportWeekly('2026/07')).toBe('/reports/weekly/2026%2F07');
    expect(AIOS_API_PATHS.reportMonthly('2026/07')).toBe('/reports/monthly/2026%2F07');
  });

  it('keeps summary mutations on generated paths with retries disabled', async () => {
    postMock.mockResolvedValue({
      report_id: 'weekly-1',
      week_period: '2026/07/01~2026/07/07',
      summary_scope: 'overview',
      task_id: 'task-1',
      status: 'PENDING',
      queued: true,
      message: 'queued',
    });
    putMock.mockResolvedValue({
      week_period: '2026/07/01~2026/07/07',
      summary_scope: 'overview',
      status: 'SUCCESS',
      content_status: 'MANUAL_EDITED',
      task_id: 'task-1',
      provider: 'manual',
      model: 'manual-edit',
      generated_at: '2026-07-23T00:00:00Z',
      updated_by: 'operator',
      approved_by: null,
      approved_at: null,
      published_by: null,
      published_at: null,
      message: null,
      conclusions: { overall: 'ok', highlights: [], risks: [] },
    });

    await generateSummary(
      'weekly-1',
      false,
      '2026/07/01~2026/07/07',
      'overview',
    );
    await updateSummary(
      'weekly-1',
      { overall: 'ok', highlights: [], risks: [] },
      '2026/07/01~2026/07/07',
      'overview',
    );

    expect(postMock).toHaveBeenCalledWith(
      AIOS_API_PATHS.reportWeeklyGenerateSummary('weekly-1'),
      expect.objectContaining({
        force_regenerate: false,
        week_period: '2026/07/01~2026/07/07',
        summary_scope: 'overview',
      }),
      expect.objectContaining({ retryMode: 'never' }),
    );
    expect(putMock).toHaveBeenCalledWith(
      AIOS_API_PATHS.reportWeeklySummary('weekly-1'),
      expect.objectContaining({
        week_period: '2026/07/01~2026/07/07',
        summary_scope: 'overview',
      }),
      expect.objectContaining({ retryMode: 'never' }),
    );
  });

  it('uses the generated summary status path for reads', async () => {
    getMock.mockResolvedValue({
      report_id: 'weekly-1',
      week_period: '2026/07/01~2026/07/07',
      summary_scope: 'overview',
      triggered: false,
      status: 'NONE',
      content_status: 'AI_DRAFT',
      task_id: null,
      generated_at: null,
      error_msg: null,
      attempt_count: 0,
      provider: null,
      model: null,
      updated_by: null,
      approved_by: null,
      approved_at: null,
      published_by: null,
      published_at: null,
    });

    await getSummaryStatus(
      'weekly-1',
      '2026/07/01~2026/07/07',
      'overview',
    );

    expect(getMock).toHaveBeenCalledWith(
      AIOS_API_PATHS.reportWeeklySummaryStatus('weekly-1'),
      expect.objectContaining({
        params: {
          week_period: '2026/07/01~2026/07/07',
          summary_scope: 'overview',
        },
      }),
    );
  });
});
