import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { fetchCompetitorOverview } from '../_lib/competitor-overview';
import { competitorPatternQueryKeys, fetchCompetitorPatterns } from '../_lib/competitor-patterns';
import { fetchLatestCompetitorReport } from '../_lib/competitor-report';
import { CompetitorOverviewWorkspace } from './competitor-overview-workspace';

vi.mock('../_lib/competitor-overview', async (original) => ({
  ...await original<object>(),
  fetchCompetitorOverview: vi.fn(),
}));
vi.mock('../_lib/competitor-patterns', async (original) => ({
  ...await original<object>(),
  fetchCompetitorPatterns: vi.fn(),
}));
// The 爆款拆解 section has its own tests; here it only needs a quiet empty answer.
vi.mock('../_lib/competitor-report', async (original) => ({
  ...await original<object>(),
  fetchLatestCompetitorReport: vi.fn(async () => ({ category: 'loose_powder', period: '2026-10-01..2026-10-31', report: null, films: 6, minFilms: 10, currentInputSnapshot: 's' })),
}));

function row(dimension: string, label: string, family: number) {
  return { dimension, label, numerator: family, denominator: 8, family_numerator: family, family_denominator: 6, example_films: ['1001'] };
}

function structure(labels: string[], families: number, sales: object) {
  return { key: labels.join(' > '), labels, films: families, families, sales, exampleFilms: ['1001'] };
}

const WINDOW = { key: 'month', from: '2026-10-01', to: '2026-10-26', today: '2026-10-26', latestActivityDate: '2026-10-24' };

const PATTERNS = {
  category: 'loose_powder',
  period: '2026-10-01..2026-10-31',
  window: WINDOW,
  pending: false,
  categories: [{ key: 'loose_powder', films: 8 }],
  ownSellingPoints: [],
  // Ours: mix > live > deal ×2 and a structure no competitor has; no selling-point original yet.
  ownStructures: {
    framework: {
      assets: 3,
      labels: { mix: '混剪口播', live: '实拍内容', deal: '机制', street: '街采' },
      rows: [{ labels: ['mix', 'live', 'deal'], assets: 2 }, { labels: ['street'], assets: 1 }],
    },
    sellingPoint: { assets: 0, labels: {}, rows: [] },
  },
  snapshot: {
    cohort: 'loose_powder',
    period: '2026-10-01..2026-10-31',
    computedAt: '2026-10-24T03:00:00Z',
    inputSnapshot: 'same-films',
    films: 8,
    families: 6,
    payload: {
      sample: { films: 8, families: 6, statuses: { succeeded: 8 } },
      rows: [row('hook', 'result_first', 4), row('hook', 'problem_named', 2), row('selling_point', 'long_wear', 5)],
      text: { scenes: { denominator: 6, labels: [{ text: '通勤', films: 3 }] }, audiences: { denominator: 6, labels: [] } },
      structures: {
        films: 8,
        missing: 1,
        sales: { available: true, films: 5 },
        labels: {
          framework: { mix: '混剪口播', live: '实拍内容', deal: '机制' },
          sellingPoint: { wear: '持妆', look: '妆效' },
        },
        labelOrder: { framework: ['mix', 'live', 'deal'], sellingPoint: ['wear', 'look'] },
        framework: {
          films: 7,
          families: 6,
          empty: 0,
          rows: [
            structure(['mix', 'live', 'deal'], 4, { min: 250000, max: 500000, rooms: 1, roomDays: 2 }),
            structure(['live'], 2, { min: 1500000, max: null, rooms: 2, roomDays: 3 }),
            structure(['mix'], 1, { min: 0, max: 0, rooms: 0, roomDays: 0 }),
          ],
          elements: [
            { key: 'has_live', kind: 'has', label: 'live', films: 6, families: 6 },
            { key: 'has_mix', kind: 'has', label: 'mix', films: 5, families: 5 },
            { key: 'first_mix', kind: 'first', label: 'mix', films: 5, families: 5 },
            { key: 'steps_three', kind: 'size', label: 'steps_three', films: 4, families: 4 },
          ],
        },
        sellingPoint: {
          films: 6,
          families: 5,
          empty: 1,
          rows: [structure(['wear', 'look'], 3, { min: 250000, max: 500000, rooms: 1, roomDays: 2 })],
        },
      },
      films: { '1001': { analysisId: 'a1', title: '示例视频' } },
      labels: {
        hook_mechanisms: { result_first: '结果先看', problem_named: '问题点名' },
        selling_points: { long_wear: '持妆' },
        product_categories: { loose_powder: '散粉' },
      },
    },
  },
};

const OVERVIEW = {
  category: 'loose_powder',
  period: '2026-10-01..2026-10-31',
  window: WINDOW,
  current: { analyzed: 8, brands: 3 },
  previous: { analyzed: 5, brands: 3 },
  analyzing: 2,
};

function renderOverview(
  path: string = ROUTE_PATHS.contentAiStudioCompetitor,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  render(
    <QueryClientProvider client={client}>
      <LobeProvider>
        <MemoryRouter initialEntries={[path]}>
          <CompetitorOverviewWorkspace />
        </MemoryRouter>
      </LobeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CompetitorOverviewWorkspace', () => {
  it('shows 爆款拆解 first, then competitor structures by films with our side waiting for 视频云管家', async () => {
    vi.mocked(fetchCompetitorPatterns).mockResolvedValue(PATTERNS as never);
    vi.mocked(fetchCompetitorOverview).mockResolvedValue(OVERVIEW as never);
    renderOverview();

    // A snapshot from before stats v2 has no breakdown: the section says it is coming.
    expect(await screen.findByText(/新版统计.*正在生成/)).toBeInTheDocument();

    const framework = screen.getByRole('list', { name: '框架结构' });
    // Films, not opening families: 4 of the lane's 7 films; 8 films < 10 shows x/n only.
    const top = within(framework).getByRole('button', {
      name: '混剪口播 → 实拍内容 → 机制：竞品 4/7，我方 —，查看代表视频',
    });
    expect(screen.getByText(/7 条 · 1 条没有框架拆解/)).toBeInTheDocument();
    fireEvent.click(top);
    expect(within(framework).getByRole('link', { name: '示例视频' })).toHaveAttribute(
      'href',
      `${ROUTE_PATHS.contentAiStudioTrends}?analysis=a1`,
    );
    // Our side waits for 视频云管家 spend: no numbers and no marks, whatever the API still sends.
    expect(screen.getAllByText('我方数据将在视频云管家接入后，按这段时间的消耗统计。').length).toBeGreaterThan(0);
    expect(screen.queryByText(/缺口|我方没有|我方偏少/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '完整结构' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '结构要素' })).not.toBeInTheDocument();
    // Structures only the old API's 我方 had no longer close the list.
    expect(within(framework).queryByLabelText(/^街采/)).not.toBeInTheDocument();
    expect(screen.getByText(/全部品类拆解中 2 条/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('卖点结构'));
    const selling = await screen.findByRole('list', { name: '卖点结构' });
    expect(within(selling).getByRole('button', { name: /^持妆 \+ 妆效：竞品 3\/6，我方 —/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '完整结构' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '结构要素' })).not.toBeInTheDocument();

    for (const retired of ['已拆解视频', '开头高光帧', '打法排行', '爆款共性', 'AI 总结与出片指导']) {
      expect(screen.queryByText(retired)).not.toBeInTheDocument();
    }
    expect(fetchCompetitorOverview).toHaveBeenCalledWith('all', { unit: 'day', date: expect.any(String) }, expect.anything());
  });

  it('opens on 全部品类 and narrows to a category named in the URL', async () => {
    renderOverview(`${ROUTE_PATHS.contentAiStudioCompetitor}?category=loose_powder`);
    await vi.waitFor(() => expect(fetchCompetitorPatterns).toHaveBeenCalledWith('loose_powder', { unit: 'day', date: expect.any(String) }, expect.anything()));
    expect(fetchCompetitorPatterns).not.toHaveBeenCalledWith('all', expect.anything(), expect.anything());
  });

  it('sorts by 关联直播间销售额 without our side and keeps the choice in the URL', async () => {
    vi.mocked(fetchCompetitorPatterns).mockResolvedValue(PATTERNS as never);
    vi.mocked(fetchCompetitorOverview).mockResolvedValue(OVERVIEW as never);
    renderOverview(`${ROUTE_PATHS.contentAiStudioCompetitor}?sort=sales&lane=framework`);

    const framework = await screen.findByRole('list', { name: '框架结构' });
    const rows = within(framework).getAllByRole('button', { name: /查看代表视频/ });
    // Highest lower bound first; a structure without 罗盘 sales leaves the ranking, and ours has no sales.
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      '实拍内容：竞品 ¥150万+，我方 —，查看代表视频',
      '混剪口播 → 实拍内容 → 机制：竞品 ¥25万–50万，我方 —，查看代表视频',
    ]);
    expect(screen.getByText(/5\/8 条视频有罗盘数据/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('按视频条数'));
    // The list remounts on a new sort (its 展开全部 state resets with it).
    const counted = await screen.findByRole('list', { name: '框架结构' });
    expect(within(counted).getByRole('button', { name: /^混剪口播：竞品 1\/7，我方 —，查看/ })).toBeInTheDocument();
  });

  it('uses the studio home period control: the covered dates, stepping and units', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T04:00:00Z')); // 12:00 on 10/26 in Beijing, the window's today
    vi.mocked(fetchCompetitorPatterns).mockResolvedValue(PATTERNS as never);
    vi.mocked(fetchCompetitorOverview).mockResolvedValue(OVERVIEW as never);
    try {
      // A retired `period` in an old link falls back to the default: 日 at yesterday.
      renderOverview(`${ROUTE_PATHS.contentAiStudioCompetitor}?period=last7`);

      const control = await screen.findByRole('group', { name: '统计时间' });
      expect(fetchCompetitorPatterns).toHaveBeenCalledWith('all', { unit: 'day', date: '2026-10-25' }, expect.anything());
      // 月 lands on the month holding yesterday; the field shows the covered dates.
      fireEvent.click(within(control).getByText('月'));
      await vi.waitFor(() =>
        expect(fetchCompetitorPatterns).toHaveBeenLastCalledWith('all', { unit: 'month', date: '2026-10-25' }, expect.anything()),
      );
      expect(await within(control).findByDisplayValue('2026/10/01 - 2026/10/26')).toBeInTheDocument();
      expect(within(control).getByRole('button', { name: '下一个月' })).toBeDisabled();
      fireEvent.click(within(control).getByRole('button', { name: '上一个月' }));
      await vi.waitFor(() =>
        expect(fetchCompetitorPatterns).toHaveBeenLastCalledWith('all', { unit: 'month', date: '2026-09-01' }, expect.anything()),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('says the statistics are being computed while the window is queued', async () => {
    vi.mocked(fetchCompetitorPatterns).mockResolvedValue({ ...PATTERNS, snapshot: null, pending: true } as never);
    vi.mocked(fetchCompetitorOverview).mockResolvedValue(OVERVIEW as never);
    renderOverview(`${ROUTE_PATHS.contentAiStudioCompetitor}?from=2026-10-02&to=2026-10-09`);

    expect(await screen.findByText(/框架结构统计还在生成/)).toBeInTheDocument();
    expect(fetchCompetitorPatterns).toHaveBeenCalledWith('all', { from: '2026-10-02', to: '2026-10-09' }, expect.anything());
  });

  it('refreshes report eligibility when a custom window finishes with the same films as its placeholder', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000, refetchOnMount: false } } });
    const custom = { from: WINDOW.from, to: WINDOW.to };
    let resolveWindow!: (value: unknown) => void;
    const firstCustomResponse = new Promise((resolve) => { resolveWindow = resolve; });
    let statisticsReady = false;
    vi.mocked(fetchCompetitorPatterns).mockImplementation(async (_category, period) =>
      ('from' in period ? await firstCustomResponse : PATTERNS) as never,
    );
    vi.mocked(fetchCompetitorOverview).mockResolvedValue(OVERVIEW as never);
    vi.mocked(fetchLatestCompetitorReport).mockImplementation(async (_category, period) => ({
      category: 'loose_powder', report: null, minFilms: 10,
      films: !('from' in period) || statisticsReady ? 6 : null,
      currentInputSnapshot: !('from' in period) || statisticsReady ? 'same-films' : null,
    }) as never);
    try {
      renderOverview(ROUTE_PATHS.contentAiStudioCompetitor, client);
      expect(await screen.findByText(/样本不足：当前 6 条/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '自定义' }));
      // The new scope's first report read completes while the old window is still a placeholder.
      expect(await screen.findByText('这个时间范围的统计生成后，才能生成拆解。')).toBeInTheDocument();
      await act(async () => resolveWindow({ ...PATTERNS, snapshot: null, pending: true }));
      const key = competitorPatternQueryKeys.patterns('all', custom);
      await vi.waitFor(() => expect(client.getQueryData<{ pending: boolean }>(key)?.pending).toBe(true));
      statisticsReady = true;
      await act(async () => { client.setQueryData(key, { ...PATTERNS, pending: false }); });
      expect(await screen.findByText(/样本不足：当前 6 条/)).toBeInTheDocument();
      expect(screen.queryByText('这个时间范围的统计生成后，才能生成拆解。')).not.toBeInTheDocument();
    } finally {
      vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ category: 'loose_powder', report: null, films: 6, minFilms: 10, currentInputSnapshot: 's' } as never);
    }
  });

  it('points to 爆款视频 when nothing in scope has been analysed', async () => {
    vi.mocked(fetchCompetitorPatterns).mockResolvedValue({ ...PATTERNS, snapshot: null } as never);
    vi.mocked(fetchCompetitorOverview).mockResolvedValue({
      ...OVERVIEW,
      current: { analyzed: 0, brands: 0 },
    } as never);
    renderOverview();

    expect(await screen.findByRole('link', { name: '去爆款视频添加' })).toHaveAttribute('href', ROUTE_PATHS.contentAiStudioTrends);
    expect(screen.getByText(/2 条正在拆解/)).toBeInTheDocument();
  });

  it('offers a retry when a read fails', async () => {
    vi.mocked(fetchCompetitorPatterns).mockResolvedValue(PATTERNS as never);
    vi.mocked(fetchCompetitorOverview).mockRejectedValue(new Error('网关超时'));
    renderOverview();

    expect(await screen.findByText('爆款分析读取失败')).toBeInTheDocument();
    expect(screen.getByText('网关超时')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
