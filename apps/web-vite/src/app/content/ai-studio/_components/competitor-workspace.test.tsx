import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LobeProvider } from '@/components/lobe-provider';
import { createCompetitorVideo, fetchCompetitorVideos, requestCompetitorAnalysis, type StudioCompetitorVideo } from '../_lib/competitor-api';
import { CompetitorWorkspace } from './competitor-workspace';

vi.mock('../_lib/competitor-api', async (original) => ({
  ...await original<object>(), fetchCompetitorVideos: vi.fn(), createCompetitorVideo: vi.fn(), requestCompetitorAnalysis: vi.fn(),
}));
vi.mock('./competitor-analysis-drawer', () => ({ CompetitorAnalysisDrawer: () => null }));
const VIDEO = { awemeId: '1001', title: '散粉实测', shareUrl: 'https://v.douyin.com/example/', latestAnalysis: null } as StudioCompetitorVideo;

function renderWorkspace(canWrite = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<LobeProvider><QueryClientProvider client={client}><MemoryRouter><CompetitorWorkspace canWrite={canWrite} /></MemoryRouter></QueryClientProvider></LobeProvider>);
}

beforeEach(() => {
  vi.mocked(fetchCompetitorVideos).mockResolvedValue({ items: [], total: 0, page: 1 } as never);
  vi.mocked(createCompetitorVideo).mockResolvedValue(VIDEO);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('competitor video intake', () => {
  it('keeps the list clear and preserves an optional draft across closing', async () => {
    const user = userEvent.setup(); renderWorkspace();
    expect(screen.queryByLabelText('抖音分享链接')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '添加视频' }));
    expect(screen.getByRole('dialog', { name: '添加竞品视频' })).toBeInTheDocument();
    expect(screen.getByLabelText('品牌')).not.toBeVisible();
    await user.type(screen.getByLabelText('抖音分享链接'), VIDEO.shareUrl);
    await user.click(screen.getByText('补充信息'));
    await user.type(screen.getByLabelText('品牌'), '测试品牌');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '添加视频' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '添加视频' }));
    expect(screen.getByLabelText('抖音分享链接')).toHaveValue(VIDEO.shareUrl);
    expect(screen.getByLabelText('品牌')).toHaveValue('测试品牌');
  });

  it('validates a blank link and adds without starting a billable analysis', async () => {
    const user = userEvent.setup(); renderWorkspace();
    await user.click(screen.getByRole('button', { name: '添加视频' }));
    await user.click(screen.getByRole('button', { name: '仅添加' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请粘贴抖音分享链接');
    expect(createCompetitorVideo).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('抖音分享链接'), VIDEO.shareUrl);
    await user.click(screen.getByRole('button', { name: '仅添加' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createCompetitorVideo).toHaveBeenCalledWith({ shareUrl: VIDEO.shareUrl, brandName: undefined, productCategory: undefined, notes: undefined }, expect.anything());
    expect(requestCompetitorAnalysis).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('已添加「散粉实测」');
  });

  it('keeps the draft and surfaces a failed analysis queue instead of reporting success', async () => {
    vi.mocked(requestCompetitorAnalysis).mockRejectedValue(new Error('服务暂不可用'));
    const user = userEvent.setup(); renderWorkspace();
    await user.click(screen.getByRole('button', { name: '添加视频' }));
    await user.type(screen.getByLabelText('抖音分享链接'), VIDEO.shareUrl);
    await user.click(screen.getByRole('button', { name: '添加并分析' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('视频已添加，但分析未发起：服务暂不可用');
    expect(screen.getByLabelText('抖音分享链接')).toHaveValue(VIDEO.shareUrl);
    expect(requestCompetitorAnalysis).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate submissions and dismissing a pending request', async () => {
    let finish!: (video: StudioCompetitorVideo) => void;
    vi.mocked(createCompetitorVideo).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup(); renderWorkspace();
    await user.click(screen.getByRole('button', { name: '添加视频' }));
    await user.type(screen.getByLabelText('抖音分享链接'), VIDEO.shareUrl);
    await user.dblClick(screen.getByRole('button', { name: '仅添加' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '仅添加' })).toBeDisabled();
    expect(createCompetitorVideo).toHaveBeenCalledTimes(1);
    finish(VIDEO);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the existing read-only permission boundary', () => {
    renderWorkspace(false);
    expect(screen.getByRole('button', { name: '添加视频' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
