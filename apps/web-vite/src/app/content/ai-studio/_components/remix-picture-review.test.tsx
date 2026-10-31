import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { StudioRemixBatchItem } from '../_lib/remix-api';
import { RemixPictureReview } from './remix-picture-review';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const item: StudioRemixBatchItem = {
  qc: { status: 'passed', reasons: [], freezeCount: 0, timestampGapCount: 0, duplicatePairCount: 0, maxAvOffsetMs: 12, sourceStatus: 'passed' },
  ordinal: 1, runId: 'run', combinationHash: 'hash', outcome: 'succeeded', runStatus: 'succeeded',
  runStage: 'delivery', waitingReason: null, jobStatus: 'completed', jobError: null, outputDeleted: false,
  outputAssetId: 'output', outputCoverUrl: null, durationMs: 152000, segments: [], review: null,
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

it('does not seek into an output deleted from the library', () => {
  render(<RemixPictureReview item={{ ...item, outputDeleted: true }} onPlay={vi.fn()} />);
  fireEvent.click(screen.getByText('查看成片中的相近位置'));
  screen.getAllByRole('button').forEach((button) => expect(button).toHaveProperty('disabled', true));
});

it.each([
  [undefined, '自动质检的画面抽样已通过，仍需人工完整观看成片。'],
  [{ status: 'incomplete', pairCount: 0, pairs: [] }, '画面检查未完成，请人工复核成片。'],
  [{ status: 'future', pairCount: 0, pairs: [] }, '画面检查未完成，请人工复核成片。'],
  [{ status: 'no_findings', pairCount: 0, pairs: [] }, '画面抽检未发现跨原片相近片段，仍需结合口播复核。'],
] as const)('shows the actual coverage state %#', (review, text) => {
  render(<RemixPictureReview item={{ ...item, pictureReview: review ? { ...review, pairs: [] } : undefined }} onPlay={vi.fn()} />);
  expect(screen.getByText(text)).toBeTruthy();
});
