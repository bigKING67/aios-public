import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIOS_API_PATHS } from '@/lib/generated-api-contract';
import { request } from '@/lib/request';
import {
  backfillIndustryMaterialBrandAiAnalysis,
  fetchIndustryMaterialInspiration,
} from './industry-material-inspiration-transport';

vi.mock('@/lib/request', () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const getMock = vi.mocked(request.get);
const postMock = vi.mocked(request.post);

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

describe('industry-material transport contract', () => {
  it('uses the generated gateway-relative read path and normalized selectors', async () => {
    getMock.mockResolvedValue({
      tab: 'douyin_live_lead_short_video',
      activeTab: 'douyin_live_lead_short_video',
      tabs: [],
      availableMonths: ['2026-07'],
      month: '2026-07',
      selectedMonth: '2026-07',
      summary: null,
      rows: [],
      brandOptions: [],
      selectedBrand: null,
      brandInsight: null,
      emptyState: null,
      placeholder: null,
    });

    await expect(fetchIndustryMaterialInspiration({
      tab: 'douyin_live_lead_short_video',
      month: '2026-07',
      brand: 'all',
    })).resolves.toMatchObject({
      tab: 'douyin_live_lead_short_video',
      month: '2026-07',
      availableMonths: ['2026-07'],
    });

    expect(getMock).toHaveBeenCalledWith(AIOS_API_PATHS.industryMaterialInspiration, {
      params: {
        tab: 'douyin_live_lead_short_video',
        month: '2026-07',
      },
      signal: undefined,
      cancelPrevious: true,
      requestKey: 'dashboard-industry-material-inspiration:douyin_live_lead_short_video:2026-07:all',
    });
  });

  it('keeps backfill on the generated base without enabling retries', async () => {
    postMock.mockResolvedValue({
      brand: { key: '卡诗', label: '卡诗' },
      tab: 'douyin_goods_short_video',
      month: '2026-07',
      source: 'auto',
      profile: 'preview_fast',
      scannedAssets: 2,
      candidateAssets: 1,
      limit: 100,
      limitReached: false,
      queuedJobs: 1,
      queuedCacheHydrationJobs: 0,
      queuedModelAnalysisJobs: 1,
      existingAnyAiAssets: 1,
      existingAiArtifactAssets: 1,
      structuredStorageReady: true,
      skippedReadyAssets: 1,
      skippedRunningJobs: 0,
      skippedNoInput: 0,
      skippedExistingJobs: 1,
      missingAnalysisBefore: 1,
      remainingMissingAfterClick: 0,
      workerTrigger: {
        status: 'created',
        queuedJobs: 1,
        immediateLimit: 10,
        flowRunId: 'flow-1',
        flowRunName: 'flow-name',
        fallback: 'scheduled',
        message: 'created',
      },
      message: 'queued',
    });
    const payload = {
      tab: 'douyin_goods_short_video',
      month: '2026-07',
      brand: '卡诗',
      source: 'auto',
      profile: 'preview_fast',
      limit: 100,
    } as const;

    await expect(backfillIndustryMaterialBrandAiAnalysis(payload)).resolves.toMatchObject({
      queuedJobs: 1,
      queuedModelAnalysisJobs: 1,
      workerTrigger: { status: 'created', queuedJobs: 1 },
    });

    expect(postMock).toHaveBeenCalledWith(
      `${AIOS_API_PATHS.industryMaterialInspiration}/brand-ai-analysis/backfill`,
      payload,
      {
        requestKey: 'dashboard-industry-material-brand-ai-backfill:douyin_goods_short_video:2026-07:卡诗',
        retryMode: 'never',
        timeout: 120_000,
      },
    );
  });
});
