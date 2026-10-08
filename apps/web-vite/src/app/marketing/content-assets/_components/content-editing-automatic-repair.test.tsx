import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { EditingRun } from '../_lib/content-editing-api';
import { isEditingWatched } from '../_lib/content-editing-state';
import { ContentEditingAutomaticRepair } from './content-editing-automatic-repair';
const run = { status: 'waiting', waitingReason: 'caption_quality_pending', request: { maxAutoRepairs: 1 } } as EditingRun;
const summary = { maxRounds: 1, roundsReserved: 1, budgetExhausted: true, latestStatus: 'production_queued', deliveryApproved: false };
afterEach(cleanup);
it('separates exhausted rounds, queued render and delivery eligibility', () => {
  render(<ContentEditingAutomaticRepair summary={summary} run={run} />);
  expect(screen.getByText(/已占用 1 \/ 1 轮/)).toHaveTextContent('已排队的制作仍按任务状态执行');
  expect(screen.getByText(/已占用/)).toHaveTextContent('不代表成片可交付');
});
it.each(['evidence_required', 'no_eligible_candidate', 'access_denied', 'blocked', 'outcome_unknown', 'reserved_outcome_unknown'])('shows stop/unknown cause %s', (latestStatus) => {
  render(<ContentEditingAutomaticRepair summary={{ ...summary, latestStatus }} run={run} />);
  expect(screen.queryByText('自动修订记录待确认')).not.toBeInTheDocument();
  expect(screen.queryByText('最近一次修订：已采用替换方案并排队')).not.toBeInTheDocument();
});
it.each([undefined, { ...summary, latestStatus: 'future' }, { ...summary, roundsReserved: 2 }, { ...summary, budgetExhausted: false }, { ...summary, deliveryApproved: true }])('handles unknown or inconsistent receipts %#', (value) => {
  render(<ContentEditingAutomaticRepair summary={value} run={run} />);
  expect(screen.getByText('自动修订记录待确认')).toBeInTheDocument();
});
it('pause overrides an old queued result and stops automatic polling', () => {
  const paused = { ...run, status: 'paused' as const };
  render(<ContentEditingAutomaticRepair summary={summary} run={paused} />);
  expect(screen.getByText('任务已暂停或停止，自动修订不会继续')).toBeInTheDocument();
  expect(isEditingWatched(paused)).toBe(false);
  expect(isEditingWatched(run)).toBe(true);
  expect(isEditingWatched({ ...run, request: { ...run.request, maxAutoRepairs: 0 } })).toBe(false);
});
