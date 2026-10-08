import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentEditingSelectedReview } from './content-editing-selected-review';
import { ContentEditingResult } from './content-editing-result';
import { editingKeys, type EditingRun, type EditingResult } from '../_lib/content-editing-api';

vi.mock('../_lib/content-editing-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../_lib/content-editing-api')>(),
  fetchEditingResult: vi.fn(() => new Promise(() => {})),
}));

const run = { runId: 'run', renderJobId: 'job', version: 2, status: 'waiting', request: { aspect: 'portrait' } } as EditingRun;
const summary = { schema: 'aios.selected-review-summary.v1', status: 'sampled_checks_passed',
  scope: 'selected_output_windows_sampled', windowCount: 1, passedWindowCount: 1,
  binding: { runId: 'run', jobId: 'job' }, deliveryApproved: false,
  unverified: ['full_video_quality', 'audio_visual_sync', 'listening', 'product_identity', 'publication_authorization'],
};
afterEach(cleanup);
it('states sampled scope and pending checks without approving delivery', () => {
  render(<ContentEditingSelectedReview summary={summary} run={run} />);
  expect(screen.getByText('片段采样检查通过')).toBeInTheDocument();
  expect(screen.getByText(/已检查 1 个片段，通过 1 个/)).toHaveTextContent('不代表整片可交付');
  expect(screen.getByText(/尚未验证/)).toHaveTextContent('声画同步、声音听检、商品身份核对、发布授权');
});
it.each(['needs_revision', 'evidence_required'])('keeps %s separate from pass', (status) => {
  render(<ContentEditingSelectedReview summary={{ ...summary, status, passedWindowCount: 0 }} run={run} />);
  expect(screen.queryByText('片段采样检查通过')).not.toBeInTheDocument();
  expect(screen.getByText(/通过 0 个/)).toBeInTheDocument();
});
it.each([undefined, null, { ...summary, status: 'future_status' }, { ...summary, windowCount: 0 },
  { ...summary, passedWindowCount: 2 }, { ...summary, passedWindowCount: 0 },
  { ...summary, binding: { runId: 'other', jobId: 'job' } }, { ...summary, deliveryApproved: true },
  { ...summary, unverified: [null] }, { ...summary, schema: 'future' }])('rejects unusable summary %#', (value) => {
  render(<ContentEditingSelectedReview summary={value} run={run} />);
  expect(screen.getByText('片段检查摘要暂不可用')).toBeInTheDocument();
  expect(screen.queryByText('片段采样检查通过')).not.toBeInTheDocument();
});
it.each([true, false])('result integration preserves ready=false, summary present=%s', (present) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(editingKeys.result(run.runId, run.version), {
    ready: false, job: null, ...(present ? { selectedReview: { summary } } : {}),
  } satisfies EditingResult);
  render(<QueryClientProvider client={client}><ContentEditingResult run={run} /></QueryClientProvider>);
  // The read-only summary cannot create playback/download or adoption actions.
  expect(screen.queryByRole('link', { name: '打开视频 / 下载' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('剪辑成片')).not.toBeInTheDocument();
  if (present) expect(screen.getByText('片段采样检查通过')).toBeInTheDocument();
  if (!present) expect(screen.queryByText('片段检查摘要暂不可用')).not.toBeInTheDocument();
  client.clear();
});
