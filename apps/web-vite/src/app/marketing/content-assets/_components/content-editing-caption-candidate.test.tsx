import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { CaptionCandidate } from '../_lib/content-editing-api';
import { ContentEditingCaptionCandidate } from './content-editing-caption-candidate';

const candidate = { status: 'inspection_pending', deliveryApproved: false, playbackUrl: '/candidate.mp4', documentSha256: 'sha',
  captionChanges: [{ captionId: 'one', before: '我们的\n头', after: '我们\n的头' }], review: { termIssueCount: 2, rejectedIssueCount: 1 },
} as CaptionCandidate;
afterEach(cleanup);
it('shows pending quality and changes, blocks duplicate adoption while saving', async () => {
  let finish!: (value: boolean) => void;
  const adopt = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  render(<ContentEditingCaptionCandidate candidate={candidate} aspect="portrait" disabled={false} onAdopt={adopt} />);
  expect(screen.getByLabelText('字幕候选检查片')).toHaveAttribute('src', '/candidate.mp4');
  expect(screen.getByText('技术检查通过，内容仍待验收')).toBeInTheDocument();
  fireEvent.click(screen.getByText('查看 1 处字幕换行调整'));
  expect(screen.getByText('修订前')).toBeInTheDocument();
  const button = screen.getByRole('button', { name: '采用字幕修订' });
  fireEvent.click(button); fireEvent.click(button);
  expect(adopt).toHaveBeenCalledTimes(1);
  await act(async () => finish(true));
  expect(screen.getByRole('button', { name: /已采用/ })).toBeDisabled();
});
it('read-only users cannot adopt and video failure gives refresh recovery', () => {
  const adopt = vi.fn();
  render(<ContentEditingCaptionCandidate candidate={candidate} aspect="portrait" disabled onAdopt={adopt} />);
  fireEvent.click(screen.getByRole('button', { name: '采用字幕修订' }));
  expect(adopt).not.toHaveBeenCalled();
  fireEvent.error(screen.getByLabelText('字幕候选检查片'));
  expect(screen.getByText('候选视频未能播放')).toBeInTheDocument();
});
