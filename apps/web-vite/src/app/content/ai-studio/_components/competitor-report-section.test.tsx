import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { fetchCompetitorVideo } from '../_lib/competitor-api';
import { readPatternPayload } from '../_lib/competitor-patterns';
import { fetchLatestCompetitorReport, requestCompetitorReport } from '../_lib/competitor-report';
import { reportFixture } from '../_lib/competitor-report-fixtures';
import { CompetitorReportSection } from './competitor-report-section';

vi.mock('../_lib/competitor-report', async (original) => ({
  ...await original<object>(),
  fetchLatestCompetitorReport: vi.fn(),
  requestCompetitorReport: vi.fn(),
}));
vi.mock('../_lib/competitor-api', async (original) => ({
  ...await original<object>(),
  fetchCompetitorVideo: vi.fn(async (awemeId: string) => ({
    awemeId, title: '持妆实测，一整天不脱妆的气垫真的有吗 #气垫', shareUrl: 'https://v.douyin.com/x/', coverUrl: null,
  })),
}));

const BASE = { category: 'loose_powder', period: '2026-10-01..2026-10-31', minFilms: 10, films: 140, currentInputSnapshot: 'snap-a' };

const PAYLOAD = readPatternPayload({
  sample: { films: 140, families: 90 },
  films: { '7000000001': { analysisId: 'a1', title: '持妆实测' } },
  labels: { hook_mechanisms: { problem_named: '问题点名' } },
  breakdown: {
    films: 140, enriched: 120, brands: { brands: 35, unknown: 2 }, sales: { available: true },
    hook: { films: 136, groups: 90, rows: [{ group: '7000000001', text: '干皮姐妹别再用控油散粉了', mechanisms: ['problem_named'], films: 12, brands: 3,
      top: [{ film: '7000000001', salesMin: 250000, salesMax: 500000, opening: '干皮姐妹别再用控油散粉了' }] }] },
    scene: { films: 120, rows: [{ key: '早上赶时间|no_caking', scene: '早上赶时间', pain: '不想化妆、着急出门', sellingPoint: 'no_caking', otherPoint: null,
      audiences: ['上班族'], text: '早上起来不想化妆', films: 22, brands: 8, top: [] }] },
    endorser: { films: 120, unnamed: { kol: { films: 7, brands: 4 } }, other: { films: 30, brands: 12, cues: {} },
      rows: [{ key: '何泓姗', name: '何泓姗', role: 'celebrity', films: 19, brands: 3, top: [] }] },
  },
});

function renderSection({ canWrite = true, payload = PAYLOAD }: { canWrite?: boolean; payload?: ReturnType<typeof readPatternPayload> | null } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LobeProvider>
        <MemoryRouter>
          <CompetitorReportSection category="loose_powder" period={{ unit: 'month' }} canWrite={canWrite} payload={payload} inputSnapshot="snap-a" />
        </MemoryRouter>
      </LobeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(requestCompetitorReport).mockResolvedValue(reportFixture({ status: 'queued', report: null }) as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CompetitorReportSection · 爆款拆解', () => {
  it('shows the three blocks from the snapshot before any report, with films and brands', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, report: null } as never);
    renderSection();
    expect(await screen.findByText('爆款拆解')).toBeInTheDocument();
    const hook = screen.getByRole('region', { name: '开头 3 秒怎么说' });
    expect(within(hook).queryByText(/干皮姐妹别再/)).not.toBeInTheDocument();
    expect(within(hook).queryByText('问题点名')).not.toBeInTheDocument();
    expect(await within(hook).findByText('正在归纳开头公式，完成后自动显示。')).toBeInTheDocument();
    expect(requestCompetitorReport).toHaveBeenCalledWith('loose_powder', { unit: 'month' }, { kind: 'openings' });
    const scene = screen.getByRole('region', { name: '在什么场景解决什么痛点' });
    expect(within(scene).getByText('妆效')).toBeInTheDocument();
    expect(within(scene).getByText('已提取 120/140 条')).toBeInTheDocument();
    const endorser = screen.getByRole('region', { name: '谁在背书' });
    expect(within(endorser).getByText('何泓姗')).toBeInTheDocument();
    expect(within(endorser).getByLabelText('未具名KOL达人：7/140 条 · 4 个品牌')).toBeInTheDocument();
    expect(screen.queryByText(/高频卖点|爆款共性|缺口/)).not.toBeInTheDocument();
  });

  it('opens every source with its own opening and pages requests five at a time', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, report: reportFixture() } as never);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: /^公式 .*查看全部来源/ }));
    expect(await screen.findByText(/不是这条视频本身带来的成交/)).toBeInTheDocument();
    expect(screen.getByText('前 3 秒画面文字（0–2.6 秒）：干皮姐妹别再用控油散粉了')).toBeInTheDocument();
    expect(screen.getByText('第 1–5 条，共 31 条')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看拆解' })).toHaveAttribute('href', '/content/ai-studio/trends?analysis=a1');
    await waitFor(() => expect(fetchCompetitorVideo).toHaveBeenCalledTimes(5));
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('前 3 秒口播（0–2.6 秒）：来源开头文案 6')).toBeInTheDocument();
    expect(screen.getByText('第 6–10 条，共 31 条')).toBeInTheDocument();
    await waitFor(() => expect(fetchCompetitorVideo).toHaveBeenCalledTimes(10));
  });

  it('keeps two videos with the same opening instead of deduplicating them', async () => {
    const fixture = reportFixture();
    const body = fixture.report as { formulas: { films: number; sources: { film: string; opening: string }[] }[] };
    body.formulas[0].films = 2;
    body.formulas[0].sources = body.formulas[0].sources.slice(0, 2).map((film) => ({ ...film, opening: '同样的开头' }));
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, report: fixture } as never);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: /^公式 .*2\/140.*查看全部来源/ }));
    expect(await screen.findAllByText(/：同样的开头/)).toHaveLength(2);
    await waitFor(() => expect(fetchCompetitorVideo).toHaveBeenCalledTimes(2));
  });

  it('says new statistics are coming on a snapshot without breakdown', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, report: null } as never);
    renderSection({ payload: readPatternPayload({ sample: { films: 140 } }) });
    expect(await screen.findByText(/新版统计.*正在生成/)).toBeInTheDocument();
  });

  it('waits for the statistics of the window before talking about the sample', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, films: null, currentInputSnapshot: null, report: null } as never);
    renderSection({ payload: null });
    expect(await screen.findByText('这个时间范围的统计生成后，才能生成拆解。')).toBeInTheDocument();
    expect(screen.queryByText(/样本不足/)).not.toBeInTheDocument();
  });

  it('asks for more films below the sample threshold and offers no generation', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, films: 4, report: null } as never);
    renderSection();
    expect(await screen.findByText(/样本不足：当前 4 条，至少 10 条/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /生成拆解/ })).not.toBeInTheDocument();
  });

  it('starts a billable report from the AI action with its estimate beside it', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, report: null } as never);
    vi.mocked(requestCompetitorReport).mockResolvedValue(reportFixture({ status: 'queued', report: null }) as never);
    renderSection();
    const button = await screen.findByRole('button', { name: /生成拆解/ });
    expect(screen.getByText(/约 ¥0.05–0.12\/次/)).toBeInTheDocument();
    await userEvent.click(button);
    await waitFor(() => expect(requestCompetitorReport).toHaveBeenCalledWith('loose_powder', { unit: 'month' }));
  });

  it('puts formulas and readings into the blocks, then 黄金结构 and 下一条怎么拍', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, report: reportFixture() } as never);
    renderSection();
    const hook = await screen.findByRole('region', { name: '开头 3 秒怎么说' });
    // The report arrives after the snapshot: its formulas replace the opening groups.
    expect(await within(hook).findByRole('button', { name: /^公式 \[人群\]别再\[错误做法\]了：31\/140 条 · 9 个品牌/ })).toBeInTheDocument();
    expect(within(hook).queryByText('“干皮姐妹别再用控油散粉了”')).not.toBeInTheDocument();
    expect(within(hook).queryByText('点名人群再纠错，适合讲持妆')).not.toBeInTheDocument();
    const golden = screen.getByRole('region', { name: '黄金结构' });
    expect(within(golden).getByText('混剪口播 → 实拍内容 → 机制（40/140 条 · 12 个品牌）')).toBeInTheDocument();
    const actions = screen.getByRole('region', { name: '下一条怎么拍' });
    expect(within(actions).getByText('拍一条早上三分钟出门的对比')).toBeInTheDocument();
    expect(within(actions).getByText(
      '结构：混剪口播 → 实拍内容 → 机制 · 开头：[人群]别再[错误做法]了 · 场景：早上赶时间 → 不想化妆、着急出门 → 妆效 · 卖点：妆效 + 持妆',
    )).toBeInTheDocument();
    expect(screen.queryByText(/统计已更新/)).not.toBeInTheDocument();
  });

  it('hides formulas from an older report and offers a regeneration', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, currentInputSnapshot: 'snap-b', report: reportFixture() } as never);
    renderSection();
    expect(await screen.findByText(/统计已更新/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /按新统计重新生成/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^公式 / })).not.toBeInTheDocument();
  });

  it('shows the reason of a failed report and lets a writer regenerate it', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({
      ...BASE,
      report: reportFixture({ status: 'failed', errorMessage: '拆解没有通过校验（引用或数字不一致），可重新生成' }),
    } as never);
    renderSection();
    expect((await screen.findAllByText(/拆解没有通过校验/)).length).toBeGreaterThan(0);
    expect(requestCompetitorReport).not.toHaveBeenCalled();
    expect(screen.getByText('失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重新生成/ })).toBeInTheDocument();
  });

  it('keeps independent formulas visible when the optional reading fails', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockImplementation(async (_category, _period, options) => ({
      ...BASE, report: options?.kind === 'openings' ? reportFixture() : reportFixture({ status: 'failed', errorMessage: '解读失败' }),
    }) as never);
    renderSection();
    expect(await screen.findByRole('button', { name: /^公式 .*查看全部来源/ })).toBeInTheDocument();
    expect(await screen.findByText('解读失败')).toBeInTheDocument();
    expect(requestCompetitorReport).not.toHaveBeenCalled();
  });

  it('a reader never queues a billable formula job', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, report: null } as never);
    renderSection({ canWrite: false });
    expect(await screen.findByText('开头公式尚未生成。')).toBeInTheDocument();
    expect(requestCompetitorReport).not.toHaveBeenCalled();
  });

  it('only an explicit retry queues a failed formula again', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockImplementation(async (_category, _period, options) => ({
      ...BASE, report: options?.kind === 'openings' ? reportFixture({ status: 'failed', errorMessage: '语义复核未通过' }) : null,
    }) as never);
    renderSection();
    const retry = await screen.findByRole('button', { name: '重试公式归纳' });
    expect(requestCompetitorReport).not.toHaveBeenCalled();
    await userEvent.click(retry);
    await waitFor(() => expect(requestCompetitorReport).toHaveBeenCalledExactlyOnceWith('loose_powder', { unit: 'month' }, { kind: 'openings', retry: true }));
  });

  it('recovers a lost retry response by reading the server result without another POST', async () => {
    let finished = false;
    vi.mocked(fetchLatestCompetitorReport).mockImplementation(async (_category, _period, options) => ({
      ...BASE, report: options?.kind === 'openings'
        ? finished ? reportFixture() : reportFixture({ status: 'failed', errorMessage: '语义复核未通过' })
        : null,
    }) as never);
    vi.mocked(requestCompetitorReport).mockImplementationOnce(async () => {
      finished = true;
      throw new Error('响应连接中断');
    });
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: '重试公式归纳' }));
    expect(await screen.findByRole('button', { name: /^公式 .*查看全部来源/ })).toBeInTheDocument();
    expect(screen.queryByText('响应连接中断')).not.toBeInTheDocument();
    expect(requestCompetitorReport).toHaveBeenCalledTimes(1);
  });

  it('shows a queued report as an AI task and gives read-only users no generation button', async () => {
    vi.mocked(fetchLatestCompetitorReport).mockResolvedValue({ ...BASE, report: reportFixture({ status: 'queued', report: null }) } as never);
    renderSection({ canWrite: false });
    expect(await screen.findByText('排队中')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /生成/ })).not.toBeInTheDocument();
  });
});
