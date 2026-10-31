import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRemixBatchPage } from '../_lib/remix-api';
import { batch, capabilities, renderView, seedPresets, serveBatches } from './remix-outputs-fixtures';

vi.mock('../_lib/ai-studio-api', async (original) => ({ ...await original<object>(), fetchStudioPresets: vi.fn() }));
vi.mock('../_lib/remix-api', async (original) => ({
  ...await original<object>(),
  cancelRemixBatch: vi.fn(),
  fetchRemixBatch: vi.fn(),
  fetchRemixBatchPage: vi.fn(),
}));

beforeEach(() => seedPresets());

afterEach(() => { cleanup(); vi.clearAllMocks(); });

/** 成片 batch list: rows, type chips, 未成片, numbered pages and scope. */
describe('成片 batch list', () => {
  it('lists batches as rows with thumbnails, progress and the failure reason', async () => {
    serveBatches([batch()]);
    renderView('/content/ai-studio/outputs');
    const link = await screen.findByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' });
    expect(link).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-1');
    // AI finished one output; until a person reviews it the batch reads 待审核, not a green 完成.
    expect(within(link).getByText('待审核')).toBeInTheDocument();
    expect(within(link).getByText('待审核 1')).toBeInTheDocument();
    expect(within(link).queryByText('部分完成')).not.toBeInTheDocument();
    expect(within(link).getByText('完成 1 / 2 条')).toBeInTheDocument();
    expect(within(link).getByText('失败 1')).toBeInTheDocument();
    expect(within(link).getByText('请求 3 条')).toBeInTheDocument();
    expect(within(link).getByText('失败原因：渲染失败')).toBeInTheDocument();
    // The first available output cover stands for the batch.
    expect(link.querySelectorAll('img')).toHaveLength(1);
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://cdn.invalid/out-1.jpg');
  });

  it('shows automatic-QC waiting reasons as business-readable row failures', async () => {
    serveBatches([
      batch({ batchId: 'b-qc-failed', productName: '粉底液', qcFailedCount: 1, failureReason: 'remix_qc_failed' }),
      batch({ batchId: 'b-qc-incomplete', productName: '口红', qcFailedCount: 1, failureReason: 'remix_qc_incomplete' }),
      batch({ batchId: 'b-source-changed', productName: '眉笔', qcFailedCount: 1, failureReason: 'remix_qc_sources_changed' }),
    ]);
    renderView('/content/ai-studio/outputs');
    const failed = await screen.findByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' });
    expect(within(failed).getByText('失败原因：自动质检未通过')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: '口红 · 混剪口播 → 实拍内容' })).getByText('失败原因：自动质检未完成')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: '眉笔 · 混剪口播 → 实拍内容' })).getByText('失败原因：源片已变化，需重新质检')).toBeInTheDocument();
  });

  it('keeps batches that produced nothing under 未成片 and returns to 全部 from there', async () => {
    serveBatches([
      batch(),
      batch({ batchId: 'b-failed', productName: '口红', status: 'failed', succeededCount: 0, failedCount: 2, availableCount: 0 }),
      batch({ batchId: 'b-running', productName: '眉笔', status: 'running', succeededCount: 0, failedCount: 0, runningCount: 2, availableCount: 0 }),
      batch({ batchId: 'b-deleted', productName: '散粉', status: 'succeeded', succeededCount: 2, failedCount: 0, availableCount: 0, coverUrls: [] }),
    ]);
    const router = renderView('/content/ai-studio/outputs');
    expect(await screen.findByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    // A rendering batch has outputs to watch, so it stays under 全部.
    expect(screen.getByRole('link', { name: '眉笔 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '口红 · 混剪口播 → 实拍内容' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /没有成片的批次/ })).not.toBeInTheDocument();

    const chips = screen.getByRole('group', { name: '成片筛选' });
    fireEvent.click(within(chips).getByRole('button', { name: '未成片：2 个失败、已取消或成片已删除的批次' }));
    expect(await screen.findByRole('link', { name: '口红 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?outputs=without');
    expect(within(chips).getByRole('button', { name: /^未成片/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getByRole('button', { name: /^全部/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' })).not.toBeInTheDocument();
    expect(fetchRemixBatchPage).toHaveBeenLastCalledWith({ mode: null, outputs: 'without', review: null }, 1, expect.anything());
    // Runs that succeeded but whose outputs were deleted never read as 已完成.
    const deleted = screen.getByRole('link', { name: '散粉 · 混剪口播 → 实拍内容' });
    expect(within(deleted).getByText('成片已删除')).toBeInTheDocument();
    expect(within(deleted).getByText('已删除 2 条')).toBeInTheDocument();
    expect(within(deleted).queryByText('已完成')).not.toBeInTheDocument();
    expect(deleted).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-deleted&outputs=without');

    fireEvent.click(within(chips).getByRole('button', { name: /^全部/ }));
    expect(await screen.findByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
  });

  it('lists batches with an output waiting for review under 待审核, across types', async () => {
    serveBatches([
      batch({ batchId: 'b-wait', productName: '粉底液' }),
      batch({ batchId: 'b-edit', mode: 'edit', productName: '口红', plannedCount: 1 }),
      batch({ batchId: 'b-done', productName: '眉笔', approvedCount: 1 }),
      batch({ batchId: 'b-failed', productName: '散粉', status: 'failed', succeededCount: 0, failedCount: 2, availableCount: 0 }),
    ]);
    const router = renderView('/content/ai-studio/outputs');
    const chips = await screen.findByRole('group', { name: '成片筛选' });
    fireEvent.click(within(chips).getByRole('button', { name: '待审核：2 个有成片等待人工审核的批次' }));
    // The previous tab's rows stay until the new page arrives.
    await waitFor(() => expect(screen.queryByRole('link', { name: '眉笔 · 混剪口播 → 实拍内容' })).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: '口红 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?review=pending');
    expect(fetchRemixBatchPage).toHaveBeenLastCalledWith({ mode: null, outputs: null, review: 'pending' }, 1, expect.anything());
    // The review page keeps the tab for the way back.
    expect(screen.getByRole('link', { name: '口红 · 混剪口播 → 实拍内容' })).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-edit&output=1&review=pending');
    fireEvent.click(within(chips).getByRole('button', { name: /^未成片/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?outputs=without'));
  });

  it('keeps rejected records out of the ordinary list and exposes them through an explicit archive', async () => {
    serveBatches([
      batch({ batchId: 'b-normal', productName: '粉底液' }),
      batch({ batchId: 'b-mixed', productName: '口红', reviewableCount: 2, rejectedCount: 1, succeededCount: 2, availableCount: 2 }),
      batch({ batchId: 'b-rejected', productName: '眉笔', reviewableCount: 1, rejectedCount: 1, status: 'succeeded', failedCount: 0 }),
    ]);
    const router = renderView('/content/ai-studio/outputs');
    const chips = await screen.findByRole('group', { name: '成片筛选' });
    expect(screen.getByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '口红 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '眉笔 · 混剪口播 → 实拍内容' })).not.toBeInTheDocument();

    fireEvent.click(within(chips).getByRole('button', { name: '已驳回：2 个保留已驳回记录的批次' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' })).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: '口红 · 混剪口播 → 实拍内容' })).toHaveAttribute(
      'href',
      '/content/ai-studio/outputs?batch=b-mixed&review=rejected',
    );
    expect(screen.getByRole('link', { name: '眉笔 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?review=rejected');
    expect(fetchRemixBatchPage).toHaveBeenLastCalledWith(
      { mode: null, outputs: null, review: 'rejected' },
      1,
      expect.anything(),
    );
  });

  it('keeps the rejected entry reachable when there are no ordinary batches', async () => {
    serveBatches([
      batch({ batchId: 'b-rejected', productName: '眉笔', reviewableCount: 1, rejectedCount: 1, status: 'succeeded', failedCount: 0 }),
    ]);
    renderView('/content/ai-studio/outputs');
    expect(await screen.findByRole('button', { name: '已驳回：1 个保留已驳回记录的批次' })).toBeInTheDocument();
    expect(screen.getByText('还没有出成片的批次。')).toBeInTheDocument();
    expect(screen.queryByText('你还没有生成过成片。')).not.toBeInTheDocument();
  });

  it('lists mixed and all-failed batches under 质检未通过 without calling the whole batch failed', async () => {
    serveBatches([
      batch({ batchId: 'b-mixed', productName: '粉底液', qcFailedCount: 1 }),
      batch({ batchId: 'b-qc-failed', productName: '口红', qcFailedCount: 2, status: 'failed', succeededCount: 0, failedCount: 2, availableCount: 0 }),
      batch({ batchId: 'b-clean', productName: '眉笔', qcFailedCount: 0, status: 'succeeded', failedCount: 0 }),
    ]);
    const router = renderView('/content/ai-studio/outputs');
    const chips = await screen.findByRole('group', { name: '成片筛选' });
    fireEvent.click(within(chips).getByRole('button', { name: '质检未通过：2 个有自动质检未通过或未完成条目的批次' }));
    const mixed = await screen.findByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' });
    await waitFor(() => expect(screen.queryByRole('link', { name: '眉笔 · 混剪口播 → 实拍内容' })).not.toBeInTheDocument());
    expect(within(mixed).getByText('待审核')).toBeInTheDocument();
    expect(within(mixed).getByText('质检未通过 1 条')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '口红 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?quality=failed');
    expect(fetchRemixBatchPage).toHaveBeenLastCalledWith(
      { mode: null, outputs: null, review: null, quality: 'failed' },
      1,
      expect.anything(),
    );
    expect(mixed).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-mixed&quality=failed');
  });

  it('makes clear that Beijing-date and structure groups cover the current server page', async () => {
    serveBatches([
      batch({ batchId: 'b-1', createdAt: '2026-10-29T16:30:00Z' }),
      batch({ batchId: 'b-2', createdAt: '2026-10-30T01:00:00+08:00', labels: ['voice'] }),
      batch({ batchId: 'b-3', createdAt: '2026-10-29T15:30:00Z' }),
    ]);
    renderView('/content/ai-studio/outputs');
    expect(await screen.findByText('第 1 / 1 页 · 当前页按北京时间与结构分组')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2026 年 10 月 30 日' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2026 年 10 月 29 日' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: '混剪口播 → 实拍内容' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '混剪口播' })).toBeInTheDocument();
  });

  it('says so when nothing waits for review', async () => {
    serveBatches([batch({ approvedCount: 1 })]);
    renderView('/content/ai-studio/outputs?review=pending');
    expect(await screen.findByText('没有待审核的成片。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '待审核：0 个有成片等待人工审核的批次' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides 未成片 when every batch has outputs', async () => {
    serveBatches([batch()]);
    renderView('/content/ai-studio/outputs');
    const chips = await screen.findByRole('group', { name: '成片筛选' });
    expect(within(chips).queryByRole('button', { name: /^未成片/ })).not.toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: /^待审核：1/ })).toBeInTheDocument();
  });

  it('splits batches by type, counting only batches with outputs, and keeps the tab in the URL', async () => {
    serveBatches([
      batch(),
      batch({ batchId: 'b-sp', mode: 'sellingPoint', productName: '口红' }),
      batch({ batchId: 'b-edit', mode: 'edit', productName: '眉笔' }),
      batch({ batchId: 'b-gone', productName: '散粉', succeededCount: 1, availableCount: 0 }),
    ]);
    renderView('/content/ai-studio/outputs?mode=sellingPoint');
    const types = await screen.findByRole('group', { name: '成片筛选' });
    expect(within(types).getByRole('button', { name: '全部：3 个有成片的批次' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(types).getByRole('button', { name: '框架混剪：1 个有成片的批次' })).toBeInTheDocument();
    expect(within(types).getByRole('button', { name: '卖点混剪：1 个有成片的批次' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(types).getByRole('button', { name: '单条剪辑：1 个有成片的批次' })).toBeInTheDocument();
    const card = screen.getByRole('link', { name: '口红 · 混剪口播 → 实拍内容' });
    expect(within(card).getByText('卖点混剪')).toBeInTheDocument();
    // Opening a batch keeps the tab for the way back.
    expect(card).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-sp&mode=sellingPoint');
    expect(screen.queryByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新建批次' })).toHaveAttribute('href', '/content/ai-studio/editing?mode=sellingPoint');

    fireEvent.click(within(types).getByRole('button', { name: '框架混剪：1 个有成片的批次' }));
    const framework = await screen.findByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' });
    // Framework cards carry their type too, now that two remix types coexist.
    expect(within(framework).getByText('框架混剪')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新建批次' })).toHaveAttribute('href', '/content/ai-studio/editing');

    fireEvent.click(within(types).getByRole('button', { name: '单条剪辑：1 个有成片的批次' }));
    expect(await screen.findByRole('link', { name: '新建剪辑' })).toHaveAttribute('href', '/content/ai-studio/editing?mode=single');
  });

  it('pages by number, keeps the page in the URL and counts every batch, not just the page', async () => {
    // 45 batches newest first: pages of 20, 20 and 5.
    serveBatches(Array.from({ length: 45 }, (_, index) => batch({ batchId: `b-${index + 1}`, productName: `产品${index + 1}` })));
    const router = renderView('/content/ai-studio/outputs');
    expect(await screen.findByRole('button', { name: '全部：45 个有成片的批次' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /混剪口播 → 实拍内容/ })).toHaveLength(20);
    expect(screen.getByText('共 45 个批次')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('3'));
    expect(await screen.findByRole('link', { name: '产品45 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /混剪口播 → 实拍内容/ })).toHaveLength(5);
    expect(fetchRemixBatchPage).toHaveBeenLastCalledWith({ mode: null, outputs: 'with', review: null }, 3, expect.anything());
    expect(router.state.location.search).toBe('?page=3');
    // Opening a batch keeps the page for the way back; switching tab starts at page 1.
    expect(screen.getByRole('link', { name: '产品45 · 混剪口播 → 实拍内容' })).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-45&page=3');
    fireEvent.click(screen.getByRole('button', { name: '框架混剪：45 个有成片的批次' }));
    await waitFor(() => expect(router.state.location.search).toBe('?mode=framework'));
  });

  it('falls back to the last page when a link points past the end', async () => {
    serveBatches(Array.from({ length: 25 }, (_, index) => batch({ batchId: `b-${index + 1}`, productName: `产品${index + 1}` })));
    const router = renderView('/content/ai-studio/outputs?page=9');
    expect(await screen.findByRole('link', { name: '产品25 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?page=2');
  });

  it('shows no pager when everything fits on one page', async () => {
    serveBatches([batch()]);
    renderView('/content/ai-studio/outputs');
    expect(await screen.findByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' })).toBeInTheDocument();
    expect(screen.queryByText(/共 \d+ 个批次/)).not.toBeInTheDocument();
  });

  it('says so when a type has no outputs yet', async () => {
    serveBatches([batch()]);
    renderView('/content/ai-studio/outputs?mode=sellingPoint');
    expect(await screen.findByText('还没有卖点混剪的成片。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '卖点混剪：0 个有成片的批次' })).toBeInTheDocument();
  });

  it('lists every batch with its creator in open access', async () => {
    serveBatches([
      batch(),
      batch({ batchId: 'b-2', ownerUserId: '42', ownerName: '业务同事', ownedByCurrentUser: false }),
      batch({ batchId: 'b-3', ownerUserId: '43', ownerName: null, ownedByCurrentUser: false }),
    ]);
    renderView('/content/ai-studio/outputs', capabilities({ openAccess: true }));
    expect(await screen.findByRole('article', { name: '全部成片批次' })).toBeInTheDocument();
    const cards = await screen.findAllByRole('link', { name: '粉底液 · 混剪口播 → 实拍内容' });
    ['我', '业务同事', '用户 43'].forEach((label, index) => expect(within(cards[index]).getByText(label)).toBeInTheDocument());
    expect(screen.getByLabelText('所有已登录账号都能查看和取消这里的批次。类型后的数字为普通成片批次；已驳回记录单独保留，质检未通过按含问题条目的批次计数。')).toBeInTheDocument();
  });

  it('keeps the scoped list without a creator column', async () => {
    serveBatches([]);
    renderView('/content/ai-studio/outputs');
    expect(await screen.findByText('你还没有生成过成片。')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '我的成片批次' })).toBeInTheDocument();
  });

});
