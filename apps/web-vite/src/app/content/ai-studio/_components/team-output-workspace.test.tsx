import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import {
  downloadTeamOutputExport,
  fetchTeamOutput,
  fetchTeamOutputVideos,
  type StudioTeamOutputResponse,
} from '../_lib/team-output';
import { TeamOutputWorkspace } from './team-output-workspace';

vi.mock('../_lib/team-output', async (original) => ({
  ...(await original<object>()),
  fetchTeamOutput: vi.fn(),
  fetchTeamOutputVideos: vi.fn(),
  downloadTeamOutputExport: vi.fn(),
}));

const METRICS = {
  uploads: 1,
  spend: 100,
  gmv: 150,
  gmvSpend: 100,
  roi: 1.5,
  newSpend: 100,
  newGmv: 150,
  newRoi: 1.5,
  spentVideos: 1,
};
const person = (key: string, name: string) => ({
  key,
  name,
  roleName: '抖音组-剪辑',
  kind: 'account',
  metrics: METRICS,
});
const RESPONSE = {
  period: { key: 'month', from: '2026-10-01', to: '2026-10-30', today: '2026-10-30', latestActivityDate: '2026-10-29' },
  dimension: 'editor',
  totals: METRICS,
  teams: [
    {
      name: '花悦',
      kind: 'team',
      metrics: METRICS,
      groups: [
        { name: '内容1组', metrics: METRICS, people: [person('a', '李明明'), person('b', '樊煜琦')] },
        { name: '内容2组', metrics: METRICS, people: [person('c', '余嘉艺')] },
      ],
    },
    {
      name: '未归属',
      kind: 'none',
      metrics: METRICS,
      groups: [{ name: '—', metrics: METRICS, people: [person('none', '无作者')] }],
    },
  ],
  quality: {
    uploadsWithoutDirector: 0,
    uploadsWithSeveralDirectors: 0,
    uploadsWithoutAuthor: 0,
    unmappedDirectorLabels: 0,
    spendWithoutGmv: 0,
    otherPlatformSpend: 0,
  },
  sync: {
    days: 29,
    spendDaysComplete: 29,
    uploadDaysComplete: 29,
    incompleteDays: [],
    latestCompleteDay: '2026-10-29',
  },
  categories: [],
} as unknown as StudioTeamOutputResponse;

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LobeProvider>
        <MemoryRouter>
          <TeamOutputWorkspace />
        </MemoryRouter>
      </LobeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('团队产出 table', () => {
  it('opens on team and group totals; groups fold one by one or all at once', async () => {
    vi.mocked(fetchTeamOutput).mockResolvedValue(RESPONSE);
    renderWorkspace();
    await screen.findByText('内容1组');
    expect(screen.queryByText('李明明')).not.toBeInTheDocument();
    expect(screen.getByText('无作者')).toBeInTheDocument(); // 未归属 lists its people directly

    fireEvent.click(screen.getByRole('button', { name: /内容1组/ }));
    expect(screen.getByText('李明明')).toBeInTheDocument();
    expect(screen.queryByText('余嘉艺')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全部展开' }));
    expect(screen.getByText('余嘉艺')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全部收起' }));
    expect(screen.queryByText('李明明')).not.toBeInTheDocument();
  });

  it('splits a person’s 成片 into those uploaded in the window and older ones that spent in it', async () => {
    vi.mocked(fetchTeamOutput).mockResolvedValue(RESPONSE);
    vi.mocked(fetchTeamOutputVideos).mockResolvedValue({
      items: [],
      total: 0,
      newTotal: 734,
      previousTotal: 228,
      page: 1,
      pageSize: 50,
    } as never);
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: /内容1组/ }));
    fireEvent.click(screen.getByRole('button', { name: '李明明' }));
    const drawer = await screen.findByRole('dialog');
    await within(drawer).findByText(/本期上传 734 条 · 以前上传、本期有消耗 228 条/);
    expect(vi.mocked(fetchTeamOutputVideos).mock.calls[0][0]).toMatchObject({ personKey: 'a', scope: 'all', page: 1 });

    fireEvent.click(within(drawer).getByText('以前上传'));
    await waitFor(() =>
      expect(vi.mocked(fetchTeamOutputVideos).mock.calls.at(-1)?.[0]).toMatchObject({ scope: 'previous', page: 1 }),
    );
  });

  it('exports the page filters from the table and one person from the drawer', async () => {
    vi.mocked(fetchTeamOutput).mockResolvedValue(RESPONSE);
    vi.mocked(fetchTeamOutputVideos).mockResolvedValue({
      items: [],
      total: 0,
      newTotal: 1,
      previousTotal: 0,
      page: 1,
      pageSize: 50,
    } as never);
    vi.mocked(downloadTeamOutputExport).mockResolvedValue();
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: /内容1组/ }));
    fireEvent.click(screen.getByRole('button', { name: '李明明' }));
    const drawer = await screen.findByRole('dialog');
    fireEvent.click(within(drawer).getByRole('button', { name: /导出明细/ }));
    await waitFor(() =>
      expect(downloadTeamOutputExport).toHaveBeenCalledWith(
        expect.objectContaining({ dimension: 'editor' }),
        'videos',
        'a',
      ),
    );
  });
});
