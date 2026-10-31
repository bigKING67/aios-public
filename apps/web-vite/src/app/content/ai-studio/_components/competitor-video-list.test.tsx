import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobeProvider } from '@/components/lobe-provider';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { StudioCompetitorVideo } from '../_lib/competitor-api';
import { CompetitorVideoList } from './competitor-video-list';

vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: vi.fn(() => false) }));

function video(awemeId: string, title: string, latestAnalysis: Partial<NonNullable<StudioCompetitorVideo['latestAnalysis']>> | null) {
  return {
    awemeId,
    title,
    shareUrl: `https://www.douyin.com/video/${awemeId}`,
    brandName: '示例品牌',
    productCategory: '气垫',
    durationSeconds: 31,
    authorName: '示例作者',
    latestAnalysis: latestAnalysis
      ? { analysisId: `a-${awemeId}`, status: 'succeeded', complete: true, createdAt: '2026-10-24T05:00:00Z', finishedAt: '2026-10-24T05:02:00Z', costYuan: 0.049, ...latestAnalysis }
      : null,
  } as StudioCompetitorVideo;
}

const VIDEOS = [
  video('1001', '意外收获的宝藏气垫', {}),
  video('1002', '选对遮瑕', { status: 'running', finishedAt: null, costYuan: null }),
  video('1003', '通勤十分钟妆', null),
];

function renderList(onOpen = vi.fn(), videos = VIDEOS, total = videos.length, onPageChange = vi.fn()) {
  render(
    <LobeProvider>
      <CompetitorVideoList
        videos={videos}
        loading={false}
        canWrite
        openAnalysisId={null}
        analyzing={null}
        onOpen={onOpen}
        onAnalyze={vi.fn()}
        onEdit={vi.fn()} page={1} total={total} onPageChange={onPageChange}
      />
    </LobeProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(useMediaQuery).mockReturnValue(false);
});

describe('CompetitorVideoList', () => {
  it('keeps the table on wide screens', () => {
    renderList();
    expect(screen.getByRole('columnheader', { name: '拆解' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '竞品视频' })).not.toBeInTheDocument();
  });

  it('shows the opening frame as a thumbnail, and a placeholder before any analysis has frames', () => {
    renderList(vi.fn(), [
      { ...video('1001', '意外收获的宝藏气垫', {}), coverUrl: 'https://cdn.invalid/1001-1000.jpg' },
      { ...video('1003', '通勤十分钟妆', null), coverUrl: null },
    ]);
    const [first, second] = screen.getAllByRole('row').slice(1);
    expect(first.querySelector('img')).toHaveAttribute('src', 'https://cdn.invalid/1001-1000.jpg');
    expect(second.querySelector('img')).toBeNull();
  });

  it('gives each video a card with its state and actions on phones', async () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const onOpen = vi.fn();
    renderList(onOpen);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const cards = within(screen.getByRole('list', { name: '竞品视频' })).getAllByRole('listitem');
    expect(cards).toHaveLength(3);

    expect(within(cards[0]).getByText('已完成')).toBeInTheDocument();
    await userEvent.click(within(cards[0]).getByRole('button', { name: '查看拆解' }));
    expect(onOpen).toHaveBeenCalledWith('a-1001', '1001');

    expect(within(cards[1]).getByText('分析中')).toBeInTheDocument();
    expect(within(cards[1]).getByRole('button', { name: '查看进度' })).toBeInTheDocument();

    expect(within(cards[2]).getByText('未分析')).toBeInTheDocument();
    expect(within(cards[2]).getByRole('button', { name: '分析' })).toBeInTheDocument();
  });

  it('uses the server total and requests another page on phones', async () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const many = Array.from({ length: 20 }, (_, index) => video(String(2000 + index), `视频 ${index + 1}`, {}));
    const onPage = vi.fn();
    renderList(vi.fn(), many, 225, onPage);
    expect(within(screen.getByRole('list', { name: '竞品视频' })).getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByText('共 225 条视频')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('2'));
    expect(onPage).toHaveBeenCalledWith(2, 20);
  });
});
