import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelRemixBatch,
  fetchRemixBatch,
  fetchRemixBatchPage,
  hasCancellableRemixItems,
  newRemixIdempotencyKey,
  remixItemStatusView,
} from '../_lib/remix-api';
import { useAuthStore } from '@/stores/auth.store';
import { isSuperAdminAccount } from '@/lib/super-admin';
import { batch, capabilities, item, renderView, seedPresets, SOURCE } from './remix-outputs-fixtures';
import { nextRemixPollInterval, REMIX_POLL_INTERVAL_MS, REMIX_POLL_WINDOW_MS } from './use-remix-batches';

vi.mock('@/lib/frontend-env', async (original) => {
  const actual = await original<typeof import('@/lib/frontend-env')>();
  return { ...actual, frontendEnv: { ...actual.frontendEnv, superAdminAccounts: 'fixture-super-admin' } };
});
vi.mock('../_lib/ai-studio-api', async (original) => ({ ...await original<object>(), fetchStudioPresets: vi.fn() }));
vi.mock('../_lib/remix-api', async (original) => ({
  ...await original<object>(),
  cancelRemixBatch: vi.fn(),
  fetchRemixBatch: vi.fn(),
  fetchRemixBatchPage: vi.fn(),
}));

/** Opens an output card's ⋯ menu and returns its item names. */
async function openMoreActions(ordinal: number): Promise<string[]> {
  fireEvent.click(screen.getByRole('button', { name: `第 ${ordinal} 条的更多操作` }));
  const items = await screen.findAllByRole('menuitem');
  return items.map((node) => node.textContent?.trim() ?? '');
}

beforeEach(() => seedPresets());

afterEach(() => { cleanup(); vi.clearAllMocks(); useAuthStore.setState(useAuthStore.getInitialState(), true); });

describe('成片 outputs view', () => {
  it('is honest when remix is off and never lists batches', async () => {
    renderView('/content/ai-studio/outputs', capabilities({ remixEnabled: false }));
    expect(screen.getByRole('heading', { name: '框架混剪未启用' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchRemixBatchPage).not.toHaveBeenCalled();
  });

  it('shows per-output status, failure reason, lineage and actions for one batch', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({
      batch: batch(),
      items: [
        item(1, {
          delivery: {
            status: 'succeeded', cloudVideoId: 'cloud-1', videoName: '粉底液成片 01', errorCode: null,
            attempts: 1, updatedAt: '2026-10-30T10:00:00+08:00', enabled: true, canRetry: false,
          },
          segments: item(1).segments.map((segment, index) => ({
            ...segment,
            spendClass: index === 0 ? 'qualified' : 'low',
            spend30d: index === 0 ? 8_000 : 200,
          })),
        }),
        item(2, {
          outcome: 'failed', runStatus: 'waiting', waitingReason: 'render_failed', jobStatus: 'failed', jobError: '制作失败：请检查源素材', outputAssetId: null,
          delivery: {
            status: 'failed', cloudVideoId: null, videoName: null, errorCode: 'import_failed',
            attempts: 1, updatedAt: '2026-10-30T10:05:00+08:00', enabled: true, canRetry: true,
          },
          qc: { status: 'failed', reasons: ['frame_freeze', 'duplicate_picture'], freezeCount: 2, timestampGapCount: 0, duplicatePairCount: 1, maxAvOffsetMs: 140, sourceStatus: 'passed' },
        }),
      ],
    });
    const router = renderView('/content/ai-studio/outputs?batch=b-1');
    expect(await screen.findByText('只生成了 2 条：可用组合只有 2 种')).toBeInTheDocument();
    expect(fetchRemixBatch).toHaveBeenCalledWith('b-1', expect.anything());
    const first = screen.getByRole('article', { name: '第 1 条成片' });
    // Cover and primary action open the output's review page.
    expect(within(first).getByRole('link', { name: '去审核' })).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-1&output=1');
    expect(within(first).getByRole('link', { name: '打开第 1 条成片' }).querySelector('img')).toHaveAttribute('src', 'https://cdn.invalid/out-1.jpg');
    expect(within(first).getByText('待审核')).toBeInTheDocument();
    expect(within(first).getByText('达标 1 段 · 低消耗 1 段')).toBeInTheDocument();
    expect(within(first).getByLabelText(/自动质检通过/)).toHaveTextContent('未发现卡帧、时间戳断层或重复画面');
    expect(within(first).getByLabelText('云管家推送：已推送')).toBeInTheDocument();
    const lineage = within(first).getByRole('list', { name: '第 1 条的片段组成' });
    expect(within(lineage).getAllByRole('link', { name: '整片-001' })[0]).toHaveAttribute(
      'href',
      `/content/ai-studio/segments?assetId=${SOURCE}&segmentId=s-1-1`,
    );
    expect(within(lineage).getByText('0:10.0–0:15.0')).toBeInTheDocument();
    const failed = screen.getByRole('article', { name: '第 2 条成片' });
    expect(within(failed).getByLabelText('第 2 条：渲染失败')).toBeInTheDocument();
    expect(within(failed).getByText('制作失败：请检查源素材')).toBeInTheDocument();
    expect(within(failed).getByLabelText(/自动质检未通过/)).toHaveTextContent('卡帧 2 处 · 重复画面 1 组');
    expect(within(failed).getByLabelText('云管家推送：推送失败')).toBeInTheDocument();
    expect(within(failed).queryByText(/达标 .* 段 · 低消耗/)).not.toBeInTheDocument();
    expect(within(failed).queryByRole('link', { name: /去审核|打开第/ })).not.toBeInTheDocument();
    expect(within(failed).getByRole('link', { name: '查看质检报告' })).toHaveAttribute(
      'href',
      '/content/ai-studio/outputs?batch=b-1&output=2',
    );
    // Secondary actions sit behind ⋯; a failed output offers no library link.
    expect(await openMoreActions(2)).toEqual(['以此为起点编辑', '任务详情']);
    // A failed render is still resumable, so it can be cancelled.
    expect(screen.getByRole('button', { name: '取消未完成' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: '任务详情' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/content/ai-studio/editing/run-2'));
  });

  it('opens QC reports from an all-failed batch while preserving list state and never offers review', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({
      batch: batch({
        batchId: 'b-all-failed', status: 'failed', succeededCount: 0, failedCount: 2, availableCount: 0,
        reviewableCount: 0, qcFailedCount: 2,
      }),
      items: [
        item(1, {
          outcome: 'failed', runStatus: 'waiting', waitingReason: 'remix_qc_failed', jobStatus: 'failed', outputAssetId: null,
          qc: { status: 'failed', reasons: ['frame_freeze'], freezeCount: 1, timestampGapCount: 0, duplicatePairCount: 0, maxAvOffsetMs: 40, sourceStatus: 'passed' },
        }),
        item(2, {
          outcome: 'failed', runStatus: 'waiting', waitingReason: 'remix_qc_incomplete', jobStatus: 'failed', outputAssetId: null,
          qc: { status: 'incomplete', reasons: ['incomplete'], freezeCount: 0, timestampGapCount: 0, duplicatePairCount: 0, maxAvOffsetMs: null, sourceStatus: 'incomplete' },
        }),
      ],
    });
    const router = renderView('/content/ai-studio/outputs?batch=b-all-failed&quality=failed&page=2');
    const cards = await screen.findAllByRole('article', { name: /第 \d 条成片/ });
    cards.forEach((card) => expect(within(card).queryByRole('link', { name: '去审核' })).not.toBeInTheDocument());
    const reports = screen.getAllByRole('link', { name: '查看质检报告' });
    expect(reports).toHaveLength(2);
    expect(reports[0]).toHaveAttribute(
      'href',
      '/content/ai-studio/outputs?batch=b-all-failed&output=1&quality=failed&page=2',
    );
    fireEvent.click(reports[0]!);
    await waitFor(() => expect(router.state.location.search).toBe('?batch=b-all-failed&output=1&quality=failed&page=2'));
    expect(await screen.findByText('自动质检未通过或未完成，不能人工审核。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '通过' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '驳回' })).not.toBeInTheDocument();
  });

  it('filters rejected outputs from an ordinary batch grid and shows only records in the rejected archive', async () => {
    const detail = {
      batch: batch({ status: 'succeeded', failedCount: 0, succeededCount: 2, availableCount: 2, reviewableCount: 2, rejectedCount: 1 }),
      items: [
        item(1),
        item(2, {
          review: {
            decision: 'rejected', reasons: ['wrong_framework'], note: '框架不符', reviewerUserId: 'u-2', reviewerName: '小李',
            reviewedAt: '2026-10-29T10:00:00+08:00',
          },
          retention: {
            reason: 'rejected', status: 'pending', cleanupAt: '2026-11-05T10:00:00+08:00', cleanedAt: null, canRestore: true,
          },
        }),
      ],
    };
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail);
    renderView('/content/ai-studio/outputs?batch=b-1');
    expect(await screen.findByRole('article', { name: '第 1 条成片' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: '第 2 条成片' })).not.toBeInTheDocument();

    cleanup();
    renderView('/content/ai-studio/outputs?batch=b-1&review=rejected');
    const rejected = await screen.findByRole('article', { name: '第 2 条成片' });
    expect(screen.queryByRole('article', { name: '第 1 条成片' })).not.toBeInTheDocument();
    expect(within(rejected).getByRole('link', { name: '查看驳回记录' })).toHaveAttribute(
      'href',
      '/content/ai-studio/outputs?batch=b-1&output=2&review=rejected',
    );
  });

  it('offers no library link from an output, even to the super admin', async () => {
    expect(isSuperAdminAccount({ username: 'fixture-super-admin', roles: [] })).toBe(true);
    useAuthStore.setState({ user: { id: 'u-1', username: 'fixture-super-admin', email: 'fixture-super-admin@example.test', is_active: true, roles: ['admin'] }, isAuthenticated: true });
    vi.mocked(fetchRemixBatch).mockResolvedValue({ batch: batch({ status: 'succeeded', failedCount: 0 }), items: [item(1)] });
    renderView('/content/ai-studio/outputs?batch=b-1');
    await screen.findByRole('article', { name: '第 1 条成片' });
    expect(await openMoreActions(1)).toEqual(['以此为起点编辑', '任务详情']);
    // Each lineage row is one line; its source opens the annotation, not a library link.
    expect(screen.queryByRole('link', { name: /在素材库查看原片/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/按标题搜索/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '打开素材库' })).not.toBeInTheDocument();
    // A settled batch offers no cancel.
    expect(screen.queryByRole('button', { name: '取消未完成' })).not.toBeInTheDocument();
  });

  it('returns from a batch to the type tab it was opened from', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({ batch: batch({ mode: 'sellingPoint', status: 'succeeded', failedCount: 0 }), items: [item(1)] });
    renderView('/content/ai-studio/outputs?batch=b-1&mode=sellingPoint');
    expect(await screen.findByRole('link', { name: '全部批次' })).toHaveAttribute('href', '/content/ai-studio/outputs?mode=sellingPoint');
  });

  it('returns from a batch to the 未成片 tab and page it was opened from', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({ batch: batch({ status: 'failed', succeededCount: 0, failedCount: 2, availableCount: 0 }), items: [item(1)] });
    renderView('/content/ai-studio/outputs?batch=b-1&outputs=without&page=2');
    expect(await screen.findByRole('link', { name: '全部批次' })).toHaveAttribute('href', '/content/ai-studio/outputs?outputs=without&page=2');
  });

  it('does not offer playback for a deleted output', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({
      batch: batch({ status: 'succeeded', failedCount: 0, availableCount: 0 }),
      items: [item(1, { outputDeleted: true, outputCoverUrl: null })],
    });
    const router = renderView('/content/ai-studio/outputs?batch=b-1');
    const first = await screen.findByRole('article', { name: '第 1 条成片' });
    expect(within(first).getByLabelText('第 1 条：成片已删除')).toBeInTheDocument();
    expect(within(first).queryByRole('link', { name: /去审核|打开第/ })).not.toBeInTheDocument();
    expect(within(first).getByRole('link', { name: '查看质检报告' })).toBeInTheDocument();
    expect(within(first).getByText('这条成片已删除，无法再播放或下载')).toBeInTheDocument();
    // Its lineage still loads in single editing.
    expect(await openMoreActions(1)).toEqual(['以此为起点编辑', '任务详情']);
    expect(screen.getByText(/已删除 1 条/)).toBeInTheDocument();
    // The batch itself never reads as 已完成 once its outputs are gone (an item card may still say so).
    expect(screen.queryAllByText('已完成').filter((node) => !node.closest('article[aria-label$="条成片"]'))).toHaveLength(0);
    fireEvent.click(screen.getByRole('menuitem', { name: '以此为起点编辑' }));
    await waitFor(() =>
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/content/ai-studio/editing?mode=single&fromBatch=b-1&ordinal=1'),
    );
  });

  it('lets anyone cancel another user\'s batch in open access but hides its owner-only task links', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({
      batch: batch({ status: 'running', runningCount: 1, failedCount: 0, ownerUserId: '42', ownerName: '业务同事', ownedByCurrentUser: false }),
      items: [item(1), item(2, { outcome: 'running', runStatus: 'running', jobStatus: 'queued', outputAssetId: null })],
    });
    renderView('/content/ai-studio/outputs?batch=b-1', capabilities({ openAccess: true }));
    expect(await screen.findByRole('button', { name: '取消未完成' })).toBeInTheDocument();
    expect(screen.getByText(/发起人：业务同事/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '任务详情' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去审核' })).toBeInTheDocument();
    expect(screen.getByText(/任务详情只对发起人开放/)).toBeInTheDocument();
  });

  it('cancels unfinished outputs only after confirmation and shows the returned state', async () => {
    const running = { batch: batch({ status: 'running', succeededCount: 1, failedCount: 0, runningCount: 2 }),
      items: [
        item(1),
        item(2, { outcome: 'running', runStatus: 'running', jobStatus: 'running', outputAssetId: null }),
        item(3, { outcome: 'running', runStatus: 'running', jobStatus: 'queued', outputAssetId: null }),
      ] };
    const cancelled = { batch: batch({ status: 'running', succeededCount: 1, failedCount: 0, runningCount: 1, cancelledCount: 1 }),
      items: [
        item(1),
        item(2, { outcome: 'running', runStatus: 'cancelling', jobStatus: 'cancel_requested', outputAssetId: null }),
        item(3, { outcome: 'cancelled', runStatus: 'cancelled', jobStatus: 'cancelled', outputAssetId: null }),
      ] };
    vi.mocked(fetchRemixBatch).mockResolvedValueOnce(running).mockResolvedValue(cancelled);
    vi.mocked(cancelRemixBatch).mockResolvedValue(cancelled);
    renderView('/content/ai-studio/outputs?batch=b-1');
    const cancel = await screen.findByRole('button', { name: '取消未完成' });
    // A running batch shows its finished share as progress.
    expect(screen.getByRole('progressbar', { name: '生成进度' })).toBeInTheDocument();
    fireEvent.click(cancel);
    expect(await screen.findByText(/已在渲染的条目需要等渲染进程停止，可能无法立即结束/)).toBeInTheDocument();
    expect(cancelRemixBatch).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: '取消这个批次里未完成的成片？' });
    const confirm = within(dialog).getByRole('button', { name: '取消未完成' });
    fireEvent.click(confirm);
    await waitFor(() => expect(cancelRemixBatch).toHaveBeenCalledTimes(1));
    expect(cancelRemixBatch).toHaveBeenCalledWith('b-1');
    const third = await screen.findByRole('article', { name: '第 3 条成片' });
    expect(await within(third).findAllByText('已取消')).not.toHaveLength(0);
    expect(within(screen.getByRole('article', { name: '第 2 条成片' })).getAllByText('取消中')).not.toHaveLength(0);
  });

  it('reports a failed cancel without retrying it', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({
      batch: batch({ status: 'running', runningCount: 1, failedCount: 0 }),
      items: [item(1, { outcome: 'running', runStatus: 'running', jobStatus: 'queued', outputAssetId: null })],
    });
    vi.mocked(cancelRemixBatch).mockRejectedValue(new Error('任务或方案已更新，请重新载入后操作'));
    renderView('/content/ai-studio/outputs?batch=b-1');
    fireEvent.click(await screen.findByRole('button', { name: '取消未完成' }));
    const dialog = await screen.findByRole('dialog', { name: '取消这个批次里未完成的成片？' });
    const confirm = within(dialog).getByRole('button', { name: '取消未完成' });
    fireEvent.click(confirm);
    expect(await screen.findByText('取消未完成成片失败')).toBeInTheDocument();
    expect(screen.getByText('任务或方案已更新，请重新载入后操作')).toBeInTheDocument();
    expect(cancelRemixBatch).toHaveBeenCalledTimes(1);
  });
});

describe('remix helpers', () => {
  it('maps item states without inventing success', () => {
    expect(remixItemStatusView({ outcome: 'running', runStatus: 'running', waitingReason: null, jobStatus: 'queued' })).toEqual({ label: '排队中', state: 'queued' });
    expect(remixItemStatusView({ outcome: 'running', runStatus: 'running', waitingReason: null, jobStatus: 'running' })).toEqual({ label: '渲染中', state: 'generating' });
    expect(remixItemStatusView({ outcome: 'running', runStatus: 'cancelling', waitingReason: null, jobStatus: 'cancel_requested' }).state).toBe('cancelled');
    expect(remixItemStatusView({ outcome: 'running', runStatus: 'paused', waitingReason: 'render_paused', jobStatus: 'cancelled' }).label).toBe('已暂停');
    expect(remixItemStatusView({ outcome: 'cancelled', runStatus: 'cancelled', waitingReason: null, jobStatus: 'cancelled' }).label).toBe('已取消');
    expect(remixItemStatusView({ outcome: 'running', runStatus: 'cancelling', waitingReason: null, jobStatus: 'cancel_requested' }).label).toBe('取消中');
    expect(remixItemStatusView({ outcome: 'failed', runStatus: 'waiting', waitingReason: 'remix_lineage_mismatch', jobStatus: 'completed' }).label)
      .toBe('成片与批次组合不一致，未回存');
    expect(remixItemStatusView({ outcome: 'failed', runStatus: 'waiting', waitingReason: 'unknown', jobStatus: 'failed' }).label).toBe('失败');
  });

  it('offers cancel only while some output is not settled', () => {
    expect(hasCancellableRemixItems([{ runStatus: 'succeeded' }, { runStatus: 'cancelling' }, { runStatus: 'cancelled' }])).toBe(false);
    expect(hasCancellableRemixItems([{ runStatus: 'succeeded' }, { runStatus: 'waiting' }])).toBe(true);
    expect(hasCancellableRemixItems([{ runStatus: 'paused' }])).toBe(true);
  });

  it('bounds polling to active batches within the window', () => {
    expect(nextRemixPollInterval(false, 0, 1)).toBe(false);
    expect(nextRemixPollInterval(true, 0, 1)).toBe(REMIX_POLL_INTERVAL_MS);
    expect(nextRemixPollInterval(true, 0, REMIX_POLL_WINDOW_MS + 1)).toBe(false);
  });

  it('creates ASCII idempotency keys', () => {
    expect(newRemixIdempotencyKey()).toMatch(/^remix-[A-Za-z0-9_-]{1,94}$/);
  });
});
