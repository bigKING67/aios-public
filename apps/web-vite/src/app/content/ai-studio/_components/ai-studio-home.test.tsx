import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { useAuthStore } from '@/stores/auth.store';
import { LobeProvider } from '@/components/lobe-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStudioCapabilities, fetchStudioOverview, type StudioOverviewResponse } from '../_lib/ai-studio-api';
import {
  analysisCostPerCall,
  buildOverviewFlow,
  formatCny,
  formatTokens,
  overviewActivityView,
  overviewPeriodLabel,
} from '../_lib/studio-overview';
import { periodQuery, periodRangeText, shiftPeriodDate, yesterdayDate } from '../_lib/studio-period';
import { AiStudioHome } from './ai-studio-home';

vi.mock('../_lib/ai-studio-api', async (original) => ({
  ...await original<object>(),
  fetchStudioCapabilities: vi.fn(),
  fetchStudioOverview: vi.fn(),
}));

const OVERVIEW: StudioOverviewResponse = {
  period: { key: 'month', from: '2026-09-01', to: '2026-09-30', today: '2026-09-30', latestActivityDate: '2026-09-30' },
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
    { kind: 'edit', id: '2af6a99c-0000-4000-8000-000000000000', title: '口红', status: 'running', detail: '1 条', createdAt: '2026-09-30T07:00:00Z' },
    { kind: 'sellingPoint', id: '7bc38409-0000-4000-8000-000000000000', title: '蜜粉', status: 'running', detail: '3 条', createdAt: '2026-09-30T06:00:00Z' },
    { kind: 'analysis', id: '6bc38409-0000-4000-8000-000000000000', title: '整片 A', status: 'failed', detail: 'provider_error', createdAt: '2026-09-30T07:00:00Z' },
  ],
};

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LobeProvider>
        <MemoryRouter>
          <AiStudioHome />
        </MemoryRouter>
      </LobeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.clearAllMocks(); useAuthStore.setState(useAuthStore.getInitialState(), true); });

describe('AI studio home for an account limited to 团队产出', () => {
  it('forwards to 团队产出 without reading the studio', () => {
    useAuthStore.setState({
      user: { id: 'u-hr', username: 'Binco', email: 'binco@example.test', is_active: true, roles: ['team_output_viewer', 'team_output_only'] },
      isAuthenticated: true,
    });
    render(
      <MemoryRouter initialEntries={[ROUTE_PATHS.contentAiStudio]}>
        <Routes>
          <Route path={ROUTE_PATHS.contentAiStudio} element={<AiStudioHome />} />
          <Route path={ROUTE_PATHS.contentAiStudioTeamOutput} element={<p>团队产出页</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('团队产出页')).toBeInTheDocument();
    expect(fetchStudioCapabilities).not.toHaveBeenCalled();
    expect(fetchStudioOverview).not.toHaveBeenCalled();
  });
});

describe('AI studio home overview', () => {
  it('shows both cost estimates, live pipeline counts and recent work', async () => {
    vi.mocked(fetchStudioCapabilities).mockResolvedValue({ enabled: true, openAccess: true, canWrite: true, segmentSuggestEnabled: true, segmentSuggestMaxAssets: 5, remixEnabled: true, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: '企业:百雀羚', products: [], canUpload: true });
    vi.mocked(fetchStudioOverview).mockResolvedValue(OVERVIEW);
    renderHome();

    const costs = await screen.findByRole('region', { name: '费用估算' });
    expect(await within(costs).findByText('¥2.32')).toBeInTheDocument();
    expect(within(costs).getByText('¥0.45')).toBeInTheDocument();
    expect(within(costs).getByText('¥1.87')).toBeInTheDocument();
    expect(within(costs).getByText(/10 个任务 · 成片 31\.2 分钟 · 1080P/)).toBeInTheDocument();
    expect(within(costs).getByText(/1 次未计价/)).toBeInTheDocument();
    // The pricing basis sits behind the info mark, not in a footnote.
    expect(within(costs).getByRole('button', { name: /估算口径：.*以账单为准/ })).toBeInTheDocument();
    expect(within(costs).getByText(/企业：百雀羚 · 全团队 · 09-01 至 09-30/)).toBeInTheDocument();

    // The chain is both the walkthrough and the live status: each step links to its page.
    const chain = screen.getByRole('list', { name: 'AI 创作制作链路' });
    expect(within(chain).getByRole('link', { name: '原片：42 条可用' })).toHaveAttribute('href', '/content/ai-studio/assets');
    expect(within(chain).getByRole('link', { name: '确认片段：12 段待确认' })).toHaveAttribute('href', '/content/ai-studio/analysis');
    expect(within(chain).getByRole('link', { name: 'AI 合成：1 批出片中' })).toBeInTheDocument();
    expect(within(chain).getByRole('link', { name: '成片：6 9 月出片' })).toBeInTheDocument();
    const recent = screen.getByRole('region', { name: '最近任务' });
    expect(within(recent).getByText(/AI 切段 · .* · 模型调用失败/)).toBeInTheDocument();
    expect(within(recent).getByText(/单条剪辑 · /)).toBeInTheDocument();
    expect(within(recent).getByText(/卖点混剪 · /)).toBeInTheDocument();
    expect(within(recent).getByRole('link', { name: /百雀羚/ })).toHaveAttribute(
      'href',
      '/content/ai-studio/outputs?batch=5bc38409-0000-4000-8000-000000000000',
    );

  });

  it('opens on 日 at yesterday and steps, switches and refines the period', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T04:00:00Z')); // 12:00 on 9/30 in Beijing
    vi.mocked(fetchStudioCapabilities).mockResolvedValue({ enabled: true, openAccess: true, canWrite: true, segmentSuggestEnabled: true, segmentSuggestMaxAssets: 5, remixEnabled: true, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: null, products: [], canUpload: true });
    // The server's answer for each query: the day asked for, or the month holding the date.
    vi.mocked(fetchStudioOverview).mockImplementation(async (query) => {
      const { today, latestActivityDate } = OVERVIEW.period;
      if (query.from && query.to) return { ...OVERVIEW, period: { key: 'custom', from: query.from, to: query.to, today, latestActivityDate } };
      const date = query.date ?? today;
      return query.unit === 'day'
        ? { ...OVERVIEW, period: { key: 'day', from: date, to: date, today, latestActivityDate } }
        : { ...OVERVIEW, period: { ...OVERVIEW.period, from: `${date.slice(0, 7)}-01` } };
    });
    try {
      renderHome();

      const control = await screen.findByRole('group', { name: '统计时间' });
      expect(fetchStudioOverview).toHaveBeenCalledWith({ unit: 'day', date: '2026-09-29' }, expect.anything());
      expect(await within(control).findByDisplayValue('2026/09/29')).toBeInTheDocument();
      // Today can still be stepped to.
      expect(within(control).getByRole('button', { name: '下一天' })).toBeEnabled();
      fireEvent.click(within(control).getByRole('button', { name: '上一天' }));
      await vi.waitFor(() =>
        expect(fetchStudioOverview).toHaveBeenLastCalledWith({ unit: 'day', date: '2026-09-28' }, expect.anything()),
      );

      // 月 lands on the month holding yesterday; the field shows the covered dates.
      fireEvent.click(within(control).getByText('月'));
      await vi.waitFor(() =>
        expect(fetchStudioOverview).toHaveBeenLastCalledWith({ unit: 'month', date: '2026-09-29' }, expect.anything()),
      );
      expect(await within(control).findByDisplayValue('2026/09/01 - 2026/09/30')).toBeInTheDocument();
      expect(within(control).getByRole('button', { name: '下一个月' })).toBeDisabled();
      // 自定义 starts from the dates on screen.
      fireEvent.click(within(control).getByText('自定义'));
      await vi.waitFor(() =>
        expect(fetchStudioOverview).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-30' }, expect.anything()),
      );
    } finally {
      vi.useRealTimers();
    }
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
  it('averages AI 切段 spend over priced calls, with a default until there are a few', () => {
    expect(analysisCostPerCall(OVERVIEW)).toEqual({ cny: 0.45 / 8, measured: true });
    const few = { ...OVERVIEW, costs: { ...OVERVIEW.costs, modelAnalysis: { ...OVERVIEW.costs.modelAnalysis, calls: 2, unpricedCalls: 0 } } };
    expect(analysisCostPerCall(few)).toEqual({ cny: 0.05, measured: false });
    expect(analysisCostPerCall(undefined)).toEqual({ cny: 0.05, measured: false });
  });

  it('names, prints and steps calendar periods', () => {
    const period = OVERVIEW.period;
    expect(periodRangeText(period)).toBe('2026/09/01 - 2026/09/30');
    expect(periodRangeText({ from: '2026-09-30', to: '2026-09-30' })).toBe('2026/09/30');
    expect(overviewPeriodLabel(period)).toBe('9 月');
    expect(overviewPeriodLabel({ ...period, key: 'day', from: '2026-09-28' })).toBe('9 月 28 日');
    expect(overviewPeriodLabel({ ...period, key: 'month', from: '2025-12-01' })).toBe('2025 年 12 月');
    expect(overviewPeriodLabel({ ...period, key: 'year', from: '2026-01-01' })).toBe('2026 年');
    expect(overviewPeriodLabel({ ...period, key: 'custom' })).toBe('所选时段');
    expect(overviewPeriodLabel(undefined)).toBe('本期');
    expect(shiftPeriodDate(period, 'month', -1)).toBe('2026-08-01');
    expect(shiftPeriodDate(period, 'month', 1)).toBeNull();
    expect(shiftPeriodDate({ ...period, key: 'day', from: '2026-09-29' }, 'day', 1)).toBe('2026-09-30');
    expect(shiftPeriodDate({ ...period, key: 'year', from: '2026-01-01' }, 'year', -1)).toBe('2025-01-01');
    expect(periodQuery({ unit: 'year' })).toEqual({ unit: 'year' });
    expect(periodQuery({ unit: 'day', date: '2026-09-28' })).toEqual({ unit: 'day', date: '2026-09-28' });
    expect(periodQuery({ unit: 'custom', from: '2026-09-01', to: '2026-09-15' })).toEqual({ from: '2026-09-01', to: '2026-09-15' });
    expect(yesterdayDate('2026-10-01')).toBe('2026-09-30');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 00:30 on 10/28 in Beijing is still 10/27 in UTC: yesterday follows Beijing.
      vi.setSystemTime(new Date('2026-10-27T16:30:00Z'));
      expect(yesterdayDate()).toBe('2026-10-27');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps small spend visible and tokens readable', () => {
    expect(formatCny(0)).toBe('¥0.00');
    expect(formatCny(0.004)).toBe('< ¥0.01');
    expect(formatTokens(3_442)).toBe('3,442');
    expect(formatTokens(425_948)).toBe('42.6 万');
  });

  it('shows active work, then failures or pending review, then the settled count per step', () => {
    const steps = buildOverviewFlow({ ...OVERVIEW, pipeline: { ...OVERVIEW.pipeline, analysisFailed: 2, segmentsSuggested: 0 } });
    expect(steps.map((step) => step.metric && `${step.metric.value} ${step.metric.caption}`)).toEqual([
      '42 条可用', '11 本期分析 · 2 次失败', '30 段已确认', '1 批出片中', '6 本期出片',
    ]);
    // Only AI at work, work waiting on a person, and failures get a dot.
    expect(steps.map((step) => step.metric?.signal)).toEqual([null, 'failed', null, 'ai', null]);
    const named = buildOverviewFlow({ ...OVERVIEW, pipeline: { ...OVERVIEW.pipeline, analysisFailed: 2 } }, '近 30 天');
    expect(named[1].metric?.caption).toBe('近 30 天分析 · 2 次失败');
    expect(named[2].metric).toEqual({ value: 12, caption: '段待确认', signal: 'attention' });
    expect(named[4].metric?.caption).toBe('近 30 天出片');
    expect(buildOverviewFlow(undefined).every((step) => step.metric === null)).toBe(true);
    expect(buildOverviewFlow(OVERVIEW)[1].metric).toEqual({ value: 9, caption: '本期分析', signal: null });
    expect(overviewActivityView({ ...OVERVIEW.recent[1], detail: 'new_code' }).detail).toBe('new_code');
    // A batch whose outputs were all deleted does not read as 已完成 on 总览 either.
    expect(overviewActivityView({ ...OVERVIEW.recent[0], status: 'outputs_deleted' }).status).toEqual({ label: '成片已删除', state: 'cancelled' });
  });
});
