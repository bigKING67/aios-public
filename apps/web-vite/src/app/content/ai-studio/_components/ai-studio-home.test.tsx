import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStudioCapabilities, fetchStudioOverview, type StudioOverviewResponse } from '../_lib/ai-studio-api';
import { buildOverviewFlow, formatCny, formatTokens, overviewActivityView } from '../_lib/studio-overview';
import { AiStudioHome } from './ai-studio-home';

vi.mock('../_lib/ai-studio-api', async (original) => ({
  ...await original<object>(),
  fetchStudioCapabilities: vi.fn(),
  fetchStudioOverview: vi.fn(),
}));

const OVERVIEW: StudioOverviewResponse = {
  period: { key: 'last30', from: '2026-08-31', to: '2026-09-30' },
  scope: 'team',
  costs: {
    totalCny: 2.32,
    modelAnalysis: {
      calls: 9,
      inputTokens: 425_948,
      audioInputTokens: 8_718,
      cachedTokens: 0,
      outputTokens: 3_442,
      estimatedCny: 0.45,
      unpricedCalls: 1,
      pricing: {
        model: 'doubao-seed-2.1-lite',
        tier: '在线推理（常规）',
        inputPerMillion: 0.8,
        audioInputPerMillion: 12,
        cachedPerMillion: 0.16,
        outputPerMillion: 2.7,
        verifiedOn: '2026-09-30',
      },
    },
    cloudComposition: {
      tasks: 10,
      outputSeconds: 1874.7,
      byResolution: [{ resolution: '1080P', seconds: 1874.7, coefficient: 6, estimatedCny: 1.87 }],
      estimatedCny: 1.87,
      basePerMinute: 0.01,
      verifiedOn: '2026-09-30',
    },
  },
  pipeline: {
    readyAssets: 42,
    analysisActive: 0,
    analysisSucceeded: 9,
    analysisFailed: 0,
    segmentsSuggested: 12,
    segmentsConfirmed: 30,
    remixBatchesRunning: 1,
    remixBatchesFailed: 0,
    outputs: 6,
  },
  recent: [
    { kind: 'remix', id: '5bc38409-0000-4000-8000-000000000000', title: '百雀羚', status: 'succeeded', detail: '4 条', createdAt: '2026-09-30T08:00:00Z' },
    { kind: 'edit', id: '2af6a99c-0000-4000-8000-000000000000', title: '面霜', status: 'running', detail: '1 条', createdAt: '2026-09-30T07:00:00Z' },
    { kind: 'analysis', id: '6bc38409-0000-4000-8000-000000000000', title: '整片 A', status: 'failed', detail: 'provider_error', createdAt: '2026-09-30T07:00:00Z' },
  ],
};

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AiStudioHome />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AI studio home overview', () => {
  it('shows both cost estimates, live pipeline counts and recent work', async () => {
    vi.mocked(fetchStudioCapabilities).mockResolvedValue({ enabled: true, openAccess: true, canWrite: true, segmentSuggestEnabled: true, segmentSuggestMaxAssets: 5, remixEnabled: true, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: '企业:百雀羚', products: [], canUpload: true });
    vi.mocked(fetchStudioOverview).mockResolvedValue(OVERVIEW);
    renderHome();

    const costs = await screen.findByRole('article', { name: '费用估算' });
    expect(await within(costs).findByText('¥2.32')).toBeInTheDocument();
    expect(within(costs).getByText('¥0.45')).toBeInTheDocument();
    expect(within(costs).getByText('¥1.87')).toBeInTheDocument();
    expect(within(costs).getByText(/10 个合成任务 · 成片 31\.2 分钟 · 1080P/)).toBeInTheDocument();
    expect(within(costs).getByText(/其中 1 次为未计价模型/)).toBeInTheDocument();
    expect(within(costs).getByText(/以账单为准/)).toBeInTheDocument();
    expect(within(costs).getByText(/企业：百雀羚 · 全团队 · 2026-08-31 至 2026-09-30/)).toBeInTheDocument();

    expect(screen.getByText('待确认 12 段')).toBeInTheDocument();
    expect(screen.getByText('1 批出片中')).toBeInTheDocument();
    const recent = screen.getByRole('article', { name: '最近任务' });
    expect(within(recent).getByText(/AI 分析 · .* · 模型调用失败/)).toBeInTheDocument();
    expect(within(recent).getByText(/单条剪辑 · /)).toBeInTheDocument();
    expect(within(recent).getByRole('link', { name: /百雀羚/ })).toHaveAttribute(
      'href',
      '/content/ai-studio/outputs?batch=5bc38409-0000-4000-8000-000000000000',
    );

    // The first-use guide links every step and remembers being collapsed.
    expect(screen.getByRole('link', { name: '上传原片' })).toHaveAttribute('href', '/content/ai-studio/assets');
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(screen.queryByRole('link', { name: '上传原片' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('aiStudio.guideCollapsed')).toBe('1');
    window.localStorage.removeItem('aiStudio.guideCollapsed');

    fireEvent.click(screen.getByText('近 7 天'));
    await vi.waitFor(() => expect(fetchStudioOverview).toHaveBeenLastCalledWith('last7', expect.anything()));
  });

  it('reports overview failures with a retry and never calls it for a disabled studio', async () => {
    vi.mocked(fetchStudioCapabilities).mockResolvedValue({ enabled: true, openAccess: false, canWrite: true, segmentSuggestEnabled: true, segmentSuggestMaxAssets: 5, remixEnabled: true, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: null, products: [], canUpload: true });
    vi.mocked(fetchStudioOverview).mockRejectedValue(new Error('网络连接失败'));
    renderHome();
    expect(await screen.findByText('无法读取创作中心总览')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument();
    cleanup();

    vi.mocked(fetchStudioOverview).mockClear();
    vi.mocked(fetchStudioCapabilities).mockResolvedValue({ enabled: false, openAccess: false, canWrite: true, segmentSuggestEnabled: false, segmentSuggestMaxAssets: 5, remixEnabled: false, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: null, products: [], canUpload: true });
    renderHome();
    expect(await screen.findByRole('heading', { name: 'AI 创作中心尚未启用' })).toBeInTheDocument();
    expect(fetchStudioOverview).not.toHaveBeenCalled();
  });
});

describe('overview formatting', () => {
  it('keeps small spend visible and tokens readable', () => {
    expect(formatCny(0)).toBe('¥0.00');
    expect(formatCny(0.004)).toBe('< ¥0.01');
    expect(formatTokens(3_442)).toBe('3,442');
    expect(formatTokens(425_948)).toBe('42.6 万');
  });

  it('prefers active work, then failures, in step badges', () => {
    const steps = buildOverviewFlow({ ...OVERVIEW, pipeline: { ...OVERVIEW.pipeline, analysisFailed: 2, segmentsSuggested: 0 } });
    expect(steps.map((step) => step.status?.label)).toEqual(['42 条可用', '本期失败 2 个', '无待确认', '1 批出片中', '本期 6 条']);
    const named = buildOverviewFlow({ ...OVERVIEW, pipeline: { ...OVERVIEW.pipeline, analysisFailed: 2 } }, '近 30 天');
    expect(named[1].status?.label).toBe('近 30 天失败 2 个');
    expect(named[4].status?.label).toBe('近 30 天 6 条');
    expect(buildOverviewFlow(undefined).every((step) => step.status === null)).toBe(true);
    expect(overviewActivityView({ ...OVERVIEW.recent[1], detail: 'new_code' }).detail).toBe('new_code');
  });
});
