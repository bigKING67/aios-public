import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createContentAssetPlaybackUrl } from '@/app/marketing/content-assets/_lib/content-assets-api';
import type { StudioRemixBatchItem } from '../_lib/remix-api';
import { RemixPictureReview } from './remix-picture-review';
import { RemixOutputPlayer } from './remix-output-player';

vi.mock('@/app/marketing/content-assets/_lib/content-assets-api', () => ({ createContentAssetPlaybackUrl: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const item: StudioRemixBatchItem = {
  ordinal: 1, runId: 'run', combinationHash: 'hash', outcome: 'succeeded', runStatus: 'succeeded',
  runStage: 'delivery', waitingReason: null, jobStatus: 'completed', jobError: null,
  outputAssetId: 'output', outputCoverUrl: null, durationMs: 152000, segments: [],
  pictureReview: { status: 'review_required', pairCount: 1, pairs: [{ leftClip: 2, rightClip: 3, leftMs: 127500, rightMs: 133000 }] },
};

it('keeps warnings advisory and opens both exact review positions', () => {
  const play = vi.fn();
  render(<RemixPictureReview item={item} onPlay={play} />);
  expect(screen.getByText('发现 1 组相近画面，建议复核')).toBeTruthy();
  fireEvent.click(screen.getByText('查看成片中的相近位置'));
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[0]); fireEvent.click(buttons[1]);
  expect(play.mock.calls).toEqual([[127500], [133000]]);
  expect(screen.queryByText(/检查通过/)).toBeNull();
});

it.each([
  [undefined, '该成片尚未进行跨原片画面检查。'],
  [{ status: 'incomplete', pairCount: 0, pairs: [] }, '画面检查未完成，请人工复核成片。'],
  [{ status: 'future', pairCount: 0, pairs: [] }, '画面检查未完成，请人工复核成片。'],
  [{ status: 'no_findings', pairCount: 0, pairs: [] }, '画面抽检未发现跨原片相近片段，仍需结合口播复核。'],
] as const)('shows the actual coverage state %#', (review, text) => {
  render(<RemixPictureReview item={{ ...item, pictureReview: review ? { ...review, pairs: [] } : undefined }} onPlay={vi.fn()} />);
  expect(screen.getByText(text)).toBeTruthy();
});

it('seeks the output video to the selected cue after metadata arrives', async () => {
  vi.mocked(createContentAssetPlaybackUrl).mockResolvedValue({ url: 'https://example.invalid/test.mp4', expiresAt: '2030-01-01', variant: 'raw', provider: 'tos_signed_url', contentType: 'video/mp4', fileSizeBytes: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><RemixOutputPlayer assetId="output" title="review" startMs={127500} onClose={vi.fn()} /></QueryClientProvider>);
  await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
  const video = document.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 152 });
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(127.5);
  Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });
  view.rerender(<QueryClientProvider client={client}><RemixOutputPlayer assetId="output" title="review" startMs={133000} onClose={vi.fn()} /></QueryClientProvider>);
  expect(video.currentTime).toBe(133);
  view.unmount();
});
