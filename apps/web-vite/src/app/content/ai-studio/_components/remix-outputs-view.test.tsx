import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStudioPresets, type StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import {
  cancelRemixBatch,
  fetchRemixBatch,
  fetchRemixBatches,
  hasCancellableRemixItems,
  newRemixIdempotencyKey,
  remixItemStatusView,
  type StudioRemixBatch,
  type StudioRemixBatchItem,
} from '../_lib/remix-api';
import { nextRemixPollInterval, REMIX_POLL_INTERVAL_MS, REMIX_POLL_WINDOW_MS } from './use-remix-batches';
import { RemixOutputsView } from './remix-outputs-view';

vi.mock('../_lib/ai-studio-api', async (original) => ({ ...await original<object>(), fetchStudioPresets: vi.fn() }));
vi.mock('../_lib/remix-api', async (original) => ({
  ...await original<object>(),
  cancelRemixBatch: vi.fn(),
  fetchRemixBatch: vi.fn(),
  fetchRemixBatches: vi.fn(),
}));

const SOURCE = '9f9f9f9f-0000-4000-8000-000000000001';

function capabilities(extra: Partial<StudioCapabilitiesResponse> = {}): StudioCapabilitiesResponse {
  return {
    enabled: true, openAccess: false, canWrite: true, segmentSuggestEnabled: false, segmentSuggestMaxAssets: 5,
    remixEnabled: true, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: null, products: [], canUpload: true, ...extra,
  };
}

function batch(extra: Partial<StudioRemixBatch> = {}): StudioRemixBatch {
  return {
    batchId: 'b-1', mode: 'framework', ownerUserId: 'u-me', ownerName: null, ownedByCurrentUser: true, presetKey: 'framework', presetVersion: 1, labels: ['voice', 'demo'], sourceAssetId: null,
    productName: '精华', requestedCount: 3, plannedCount: 2, seed: 7, status: 'partially_failed',
    shortfallReason: '可用组合只有 2 种', succeededCount: 1, failedCount: 1, runningCount: 0, cancelledCount: 0,
    coverUrls: ['https://cdn.invalid/out-1.jpg'], failureReason: 'render_failed',
    createdAt: '2026-09-29T10:00:00+08:00', updatedAt: '2026-09-29T10:05:00+08:00', ...extra,
  };
}

function item(ordinal: number, extra: Partial<StudioRemixBatchItem> = {}): StudioRemixBatchItem {
  return {
    ordinal, runId: `run-${ordinal}`, combinationHash: 'a'.repeat(64), outcome: 'succeeded', runStatus: 'succeeded',
    runStage: 'delivery', waitingReason: null, jobStatus: 'completed', jobError: null, outputAssetId: `out-${ordinal}`,
    outputCoverUrl: `https://cdn.invalid/out-${ordinal}.jpg`, durationMs: 9500,
    segments: [
      { segmentId: `s-${ordinal}-1`, assetId: SOURCE, assetTitle: '整片-001', labelKey: 'voice', startMs: 0, endMs: 4500 },
      { segmentId: `s-${ordinal}-2`, assetId: SOURCE, assetTitle: '整片-001', labelKey: 'demo', startMs: 10000, endMs: 15000 },
    ],
    ...extra,
  };
}

function renderView(entry: string, caps = capabilities()) {
  // Mirrors the app-wide mutation retry default so a cancel that retried would be caught.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 1, retryDelay: 1 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <RemixOutputsView capabilities={caps} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(fetchStudioPresets).mockResolvedValue([
    {
      presetKey: 'framework', version: 1, status: 'active', dimension: 'framework', name: '框架 v1',
      labels: [{ key: 'voice', name: '混剪口播', definition: '' }, { key: 'demo', name: '实拍内容', definition: '' }],
    },
  ]);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('成片 outputs view', () => {
  it('is honest when remix is off and never lists batches', async () => {
    renderView('/content/ai-studio/outputs', capabilities({ remixEnabled: false }));
    expect(screen.getByRole('heading', { name: '框架混剪未启用' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchRemixBatches).not.toHaveBeenCalled();
  });

  it('lists batches as cards with covers, progress and the failure reason', async () => {
    vi.mocked(fetchRemixBatches).mockResolvedValue([batch()]);
    renderView('/content/ai-studio/outputs');
    const link = await screen.findByRole('link', { name: '精华 · 混剪口播 → 实拍内容' });
    expect(link).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-1');
    expect(within(link).getByText('部分失败')).toBeInTheDocument();
    expect(within(link).getByText('完成 1 / 2 条')).toBeInTheDocument();
    expect(within(link).getByText('失败 1')).toBeInTheDocument();
    expect(within(link).getByText('请求 3 条')).toBeInTheDocument();
    expect(within(link).getByText('失败原因：渲染失败')).toBeInTheDocument();
    // One cover per planned output (up to four); a missing cover keeps its slot.
    expect(link.querySelectorAll('img')).toHaveLength(1);
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://cdn.invalid/out-1.jpg');
  });

  it('shows per-output status, failure reason, lineage and actions for one batch', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({
      batch: batch(),
      items: [
        item(1),
        item(2, { outcome: 'failed', runStatus: 'waiting', waitingReason: 'render_failed', jobStatus: 'failed', jobError: '制作失败：请检查源素材', outputAssetId: null }),
      ],
    });
    renderView('/content/ai-studio/outputs?batch=b-1');
    expect(await screen.findByText('只生成了 2 条：可用组合只有 2 种')).toBeInTheDocument();
    expect(fetchRemixBatch).toHaveBeenCalledWith('b-1', expect.anything());
    const first = screen.getByRole('article', { name: '第 1 条成片' });
    expect(within(first).getByRole('button', { name: '播放 / 下载' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: '播放第 1 条成片' }).querySelector('img')).toHaveAttribute('src', 'https://cdn.invalid/out-1.jpg');
    const lineage = within(first).getByRole('list', { name: '第 1 条的片段组成' });
    expect(within(lineage).getAllByRole('link', { name: '整片-001' })[0]).toHaveAttribute(
      'href',
      `/content/ai-studio/segments?assetId=${SOURCE}&segmentId=s-1-1`,
    );
    expect(within(lineage).getByText('0:10.0–0:15.0')).toBeInTheDocument();
    const failed = screen.getByRole('article', { name: '第 2 条成片' });
    expect(within(failed).getByRole('button', { name: '第 2 条：渲染失败' })).toBeDisabled();
    expect(within(failed).getByText('制作失败：请检查源素材')).toBeInTheDocument();
    expect(within(failed).queryByRole('button', { name: '播放 / 下载' })).not.toBeInTheDocument();
    expect(within(failed).getByRole('link', { name: '任务详情' })).toHaveAttribute('href', '/content/ai-studio/editing/run-2');
    expect(within(failed).queryByRole('link', { name: '在素材库查看' })).not.toBeInTheDocument();
    // A failed render is still resumable, so it can be cancelled.
    expect(screen.getByRole('button', { name: '取消未完成' })).toBeInTheDocument();
  });

  it('deep-links outputs and lineage sources to the library asset detail in a new tab', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({ batch: batch({ status: 'succeeded', failedCount: 0 }), items: [item(1)] });
    renderView('/content/ai-studio/outputs?batch=b-1');
    const output = await screen.findByRole('link', { name: '在素材库查看' });
    expect(output).toHaveAttribute('href', '/marketing/content-assets/out-1');
    expect(output).toHaveAttribute('target', '_blank');
    expect(output).toHaveAttribute('rel', 'noopener noreferrer');
    const sources = screen.getAllByRole('link', { name: '在素材库查看原片 整片-001' });
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute('href', `/marketing/content-assets/${SOURCE}`);
    expect(sources[0]).toHaveAttribute('target', '_blank');
    expect(screen.queryByText(/按标题搜索/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '打开素材库' })).not.toBeInTheDocument();
    // A settled batch offers no cancel.
    expect(screen.queryByRole('button', { name: '取消未完成' })).not.toBeInTheDocument();
  });

  it('folds batches that produced nothing behind a toggle', async () => {
    vi.mocked(fetchRemixBatches).mockResolvedValue([
      batch(),
      batch({ batchId: 'b-failed', productName: '面霜', status: 'failed', succeededCount: 0, failedCount: 2 }),
      batch({ batchId: 'b-running', productName: '眼霜', status: 'running', succeededCount: 0, failedCount: 0, runningCount: 2 }),
    ]);
    renderView('/content/ai-studio/outputs');
    expect(await screen.findByRole('link', { name: '精华 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '眼霜 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '面霜 · 混剪口播 → 实拍内容' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示 1 个没有成片的批次（失败或已取消）' }));
    expect(screen.getByRole('link', { name: '面霜 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
  });

  it('lists every batch with its creator in open access', async () => {
    vi.mocked(fetchRemixBatches).mockResolvedValue([
      batch(),
      batch({ batchId: 'b-2', ownerUserId: '42', ownerName: '业务同事', ownedByCurrentUser: false }),
      batch({ batchId: 'b-3', ownerUserId: '43', ownerName: null, ownedByCurrentUser: false }),
    ]);
    renderView('/content/ai-studio/outputs', capabilities({ openAccess: true }));
    expect(await screen.findByRole('heading', { name: '全部成片批次' })).toBeInTheDocument();
    const cards = await screen.findAllByRole('link', { name: '精华 · 混剪口播 → 实拍内容' });
    ['我', '业务同事', '用户 43'].forEach((label, index) => expect(within(cards[index]).getByText(label)).toBeInTheDocument());
    expect(screen.getByText(/显示所有人最近 50 个批次/)).toBeInTheDocument();
  });

  it('keeps the scoped list without a creator column', async () => {
    vi.mocked(fetchRemixBatches).mockResolvedValue([]);
    renderView('/content/ai-studio/outputs');
    expect(await screen.findByText('你还没有生成过成片。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '我的成片批次' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: '播放 / 下载' })).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: '取消未完成' }));
    expect(await screen.findByText(/已在渲染的条目需要等渲染进程停止，可能无法立即结束/)).toBeInTheDocument();
    expect(cancelRemixBatch).not.toHaveBeenCalled();
    const confirm = screen.getAllByRole('button', { name: '取消未完成' }).find((button) => button.closest('.ant-popover'))!;
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
    const confirm = (await screen.findAllByRole('button', { name: '取消未完成' })).find((button) => button.closest('.ant-popover'))!;
    fireEvent.click(confirm);
    expect(await screen.findByText('取消未完成成片失败')).toBeInTheDocument();
    expect(screen.getByText('任务或方案已更新，请重新载入后操作')).toBeInTheDocument();
    expect(cancelRemixBatch).toHaveBeenCalledTimes(1);
  });
});

describe('remix helpers', () => {
  it('maps item states without inventing success', () => {
    expect(remixItemStatusView({ outcome: 'running', runStatus: 'running', waitingReason: null, jobStatus: 'queued' }).label).toBe('排队中');
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
