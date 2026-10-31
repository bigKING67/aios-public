import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { apiClient } from '@/lib/api-client';
import { CompetitorWorkspace } from './competitor-workspace';

vi.mock('./competitor-video-filters', () => ({ CompetitorVideoFilters: () => null }));
vi.mock('./competitor-video-list', () => ({ CompetitorVideoList: () => null }));
vi.mock('./competitor-analysis-drawer', () => ({ CompetitorAnalysisDrawer: () => null }));

function Location() { return <output data-testid="location">{useLocation().search}</output>; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('duplicate video collection', () => {
  it.each(['queued', 'running', 'succeeded', 'partial', 'failed'])('reuses an existing %s analysis without a paid request', async (status) => {
    const video = { awemeId: '740000000001', title: '已有视频', addOutcome: 'existing',
      latestAnalysis: { analysisId: 'existing-analysis', status, complete: status === 'succeeded' } };
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => ({ data: url.endsWith('/videos') ? { items: [], total: 0, page: 1 } : video }) as never);
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: video } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<LobeProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={['/?source=compass&unit=month&date=2026-09-01&page=2']}>
      <CompetitorWorkspace canWrite /><Location />
    </MemoryRouter></QueryClientProvider></LobeProvider>);
    await userEvent.click(screen.getByRole('button', { name: '添加视频' }));
    await userEvent.type(screen.getByLabelText('抖音分享链接'), 'https://www.douyin.com/video/740000000001');
    await userEvent.click(screen.getByRole('button', { name: '添加并分析' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('analysis=existing-analysis'));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatch(/\/competitor\/videos$/);
    expect(screen.getByTestId('location')).toHaveTextContent('source=compass&unit=month&date=2026-09-01&page=2');
    expect(screen.getByText(/已存在，已保留原有资料/)).toBeInTheDocument();
    client.clear();
  });
});
