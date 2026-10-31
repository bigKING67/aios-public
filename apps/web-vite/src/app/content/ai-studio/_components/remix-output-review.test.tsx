import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentAssetPlaybackUrl } from '@/app/marketing/content-assets/_lib/content-assets-api';
import {
  clearRemixOutputReview,
  fetchRemixBatch,
  retryRemixDelivery,
  reviewRemixOutput,
  type StudioRemixBatchDetail,
  type StudioRemixOutputReview,
} from '../_lib/remix-api';
import { batch, item, renderView, seedPresets, serveBatches } from './remix-outputs-fixtures';

vi.mock('../_lib/ai-studio-api', async (original) => ({ ...await original<object>(), fetchStudioPresets: vi.fn() }));
vi.mock('../_lib/remix-api', async (original) => ({
  ...await original<object>(),
  cancelRemixBatch: vi.fn(),
  clearRemixOutputReview: vi.fn(),
  fetchRemixBatch: vi.fn(),
  fetchRemixBatchPage: vi.fn(),
  retryRemixDelivery: vi.fn(),
  reviewRemixOutput: vi.fn(),
}));
vi.mock('@/app/marketing/content-assets/_lib/content-assets-api', async (original) => ({
  ...await original<object>(),
  createContentAssetPlaybackUrl: vi.fn(),
}));

const PLAYBACK = { url: 'https://cdn.invalid/out.mp4', expiresAt: '2030-01-01T00:00:00Z', variant: 'raw', provider: 'tos_signed_url', contentType: 'video/mp4', fileSizeBytes: null } as const;

function approved(extra: Partial<StudioRemixOutputReview> = {}): StudioRemixOutputReview {
  return { decision: 'approved', reasons: [], note: null, reviewerUserId: 'u-me', reviewerName: '小王', reviewedAt: '2026-10-26T10:00:00+08:00', ...extra };
}

function delivery(extra: Partial<NonNullable<ReturnType<typeof item>['delivery']>> = {}) {
  return {
    status: 'failed', cloudVideoId: null, videoName: null, errorCode: 'import_failed',
    attempts: 1, updatedAt: '2026-10-30T10:00:00+08:00', enabled: true, canRetry: true,
    ...extra,
  };
}

/** A settled two-output batch, both waiting for review unless `items` says otherwise. */
function detail(items = [item(1), item(2)], extra = {}): StudioRemixBatchDetail {
  const reviewed = items.filter((entry) => entry.review);
  return {
    batch: batch({
      status: 'succeeded', succeededCount: items.length, failedCount: 0, availableCount: items.length, reviewableCount: items.length,
      approvedCount: reviewed.filter((entry) => entry.review?.decision === 'approved').length,
      rejectedCount: reviewed.filter((entry) => entry.review?.decision === 'rejected').length,
      ...extra,
    }),
    items,
  };
}

beforeEach(() => {
  seedPresets();
  vi.mocked(createContentAssetPlaybackUrl).mockResolvedValue({ ...PLAYBACK });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('成片审核 page', () => {
  it('plays the output with its segments on the output clock and seeks from a block', async () => {
    const frozen = item(1);
    frozen.segments = frozen.segments.map((segment, index) => ({
      ...segment,
      spendClass: index === 0 ? 'qualified' : 'unknown',
      spend30d: index === 0 ? 9_000 : null,
    }));
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail([frozen, item(2)]));
    renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    expect(await screen.findByRole('heading', { name: '粉底液 · 第 1 条 / 共 2 条' })).toBeInTheDocument();
    expect(screen.getAllByText('待审核').length).toBeGreaterThan(0);
    expect(screen.getByText(/时长 0:09.5 · 2 段 · 达标 1 段 · 低消耗 1 段/)).toBeInTheDocument();
    expect(screen.getByLabelText(/自动质检通过/)).toHaveTextContent('最大音画偏移 12 ms');
    const video = await screen.findByLabelText('第 1 条成片');
    expect(video).toHaveAttribute('src', PLAYBACK.url);
    expect(createContentAssetPlaybackUrl).toHaveBeenCalledWith('out-1', 'raw');
    expect(screen.getByRole('link', { name: '下载成片' })).toHaveAttribute('href', PLAYBACK.url);
    // Segments play back to back: 0:00.0–0:04.5 then 0:04.5–0:09.5, whatever their source interval.
    const timeline = screen.getByRole('group', { name: '成片时间轴' });
    expect(within(timeline).getByRole('button', { name: '第 1 段 混剪口播，成片 0:00.0–0:04.5，来自 整片-001' })).toBeInTheDocument();
    const second = within(timeline).getByRole('button', { name: '第 2 段 实拍内容，成片 0:04.5–0:09.5，来自 整片-001' });
    (video as HTMLVideoElement).play = vi.fn().mockResolvedValue(undefined);
    fireEvent.click(second);
    expect((video as HTMLVideoElement).currentTime).toBe(4.5);
    // Sources keep their own interval and open the annotation.
    expect(within(screen.getByRole('list', { name: '第 1 条的片段组成' })).getByText('0:10.0–0:15.0')).toBeInTheDocument();
    // Batch navigation and the way back to the batch.
    expect(screen.getByRole('link', { name: '下一条' })).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-1&output=2');
    expect(screen.queryByRole('link', { name: '上一条' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回批次' })).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-1');
  });

  it('approves in one click and points at the next output waiting for review', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail());
    vi.mocked(reviewRemixOutput).mockResolvedValue(detail([item(1, { review: approved() }), item(2)]));
    renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    fireEvent.click(await screen.findByRole('button', { name: '通过' }));
    await waitFor(() => expect(reviewRemixOutput).toHaveBeenCalledWith('b-1', 1, { decision: 'approved', reasons: [], note: null }));
    expect(await screen.findByText(/小王 · /)).toBeInTheDocument();
    expect(screen.getAllByText('已通过').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '下一条待审核：第 2 条 →' })).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-1&output=2');
    expect(screen.getByRole('button', { name: '改为驳回' })).toBeInTheDocument();
  });

  it('rejects only with a reason and sends the note', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail());
    vi.mocked(reviewRemixOutput).mockResolvedValue(
      detail([
        item(1, {
          review: approved({ decision: 'rejected', reasons: ['duplicate_picture'], note: '第 2 段重复' }),
          retention: {
            reason: 'rejected', status: 'pending', cleanupAt: '2026-11-02T10:00:00+08:00', cleanedAt: null, canRestore: true,
          },
        }),
        item(2),
      ]),
    );
    renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    fireEvent.click(await screen.findByRole('button', { name: '驳回' }));
    const confirm = screen.getByRole('button', { name: '确认驳回' });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: '掉帧' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '框架用错' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: '驳回原因' })).getByRole('button', { name: '画面重复' }));
    fireEvent.change(screen.getByLabelText('驳回备注'), { target: { value: ' 第 2 段重复 ' } });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(reviewRemixOutput).toHaveBeenCalledWith('b-1', 1, { decision: 'rejected', reasons: ['duplicate_picture'], note: '第 2 段重复' }),
    );
    expect(await screen.findByText('画面重复')).toBeInTheDocument();
    expect(screen.getByText('第 2 段重复')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤回驳回' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '改为通过' })).not.toBeInTheDocument();
  });

  it('supports A/R/N shortcuts while protecting text input, composition, repeats and modifiers', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail());
    vi.mocked(reviewRemixOutput).mockResolvedValue(detail([item(1, { review: approved() }), item(2)]));
    const router = renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    await screen.findByRole('button', { name: '通过' });

    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByRole('button', { name: '确认驳回' })).toBeDisabled();
    expect(reviewRemixOutput).not.toHaveBeenCalled();
    const note = screen.getByLabelText('驳回备注');
    fireEvent.keyDown(note, { key: 'a' });
    fireEvent.keyDown(note, { key: 'n' });
    fireEvent.keyDown(window, { key: 'a', repeat: true });
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', isComposing: true });
    expect(reviewRemixOutput).not.toHaveBeenCalled();
    expect(router.state.location.search).toBe('?batch=b-1&output=1');

    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => expect(reviewRemixOutput).toHaveBeenCalledWith('b-1', 1, { decision: 'approved', reasons: [], note: null }));
    fireEvent.keyDown(window, { key: 'n' });
    await waitFor(() => expect(router.state.location.search).toBe('?batch=b-1&output=2'));
  });

  it('ignores shortcuts while a review save is in flight', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail());
    vi.mocked(reviewRemixOutput).mockImplementation(() => new Promise(() => undefined));
    const router = renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    await screen.findByRole('button', { name: '通过' });
    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => expect(reviewRemixOutput).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'n' });
    expect(reviewRemixOutput).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: '驳回原因' })).not.toBeInTheDocument();
    expect(router.state.location.search).toBe('?batch=b-1&output=1');
  });

  it('blocks review shortcuts for a QC-failed output and marks historical missing QC as unverified', async () => {
    const failedQc = item(1, {
      qc: { status: 'failed', reasons: ['timestamp_gap'], freezeCount: 0, timestampGapCount: 2, duplicatePairCount: 0, maxAvOffsetMs: 180, sourceStatus: 'passed' },
    });
    vi.mocked(fetchRemixBatch).mockResolvedValueOnce(detail([failedQc, item(2)], { qcFailedCount: 1 }));
    const router = renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    expect(await screen.findByText('自动质检未通过或未完成，不能人工审核。')).toBeInTheDocument();
    expect(screen.getByLabelText(/自动质检未通过/)).toHaveTextContent('时间戳断层 2 处');
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'n' });
    expect(reviewRemixOutput).not.toHaveBeenCalled();
    expect(router.state.location.search).toBe('?batch=b-1&output=1');

    cleanup();
    vi.mocked(fetchRemixBatch).mockResolvedValueOnce(detail([item(1, { qc: undefined })], { plannedCount: 1 }));
    renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    expect(await screen.findByLabelText('自动质检未验证：历史成片没有质检记录')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '通过' })).toBeInTheDocument();
  });

  it('queues one retry for a retryable failed delivery and reads back the returned pending state', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail([item(1, { delivery: delivery() })], { plannedCount: 1 }));
    vi.mocked(retryRemixDelivery).mockResolvedValue(
      detail([item(1, { delivery: delivery({ status: 'pending', errorCode: null, attempts: 2, canRetry: false }) })], { plannedCount: 1 }),
    );
    renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    expect(await screen.findByLabelText('云管家推送：推送失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新排队' }));
    await waitFor(() => expect(retryRemixDelivery).toHaveBeenCalledWith('b-1', 1));
    expect(retryRemixDelivery).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('云管家推送：待推送')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新排队' })).not.toBeInTheDocument();
  });

  it('shows a retry network failure without changing the failed delivery or retrying automatically', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail([item(1, { delivery: delivery() })], { plannedCount: 1 }));
    vi.mocked(retryRemixDelivery).mockRejectedValue(new Error('排队服务暂不可用'));
    renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    fireEvent.click(await screen.findByRole('button', { name: '重新排队' }));
    expect(await screen.findByText('重新排队失败')).toBeInTheDocument();
    expect(screen.getByText('排队服务暂不可用')).toBeInTheDocument();
    expect(screen.getByLabelText('云管家推送：推送失败')).toBeInTheDocument();
    expect(retryRemixDelivery).toHaveBeenCalledTimes(1);
  });

  it('clears a review back to 待审核 and shows a failed save', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail([item(1, { review: approved() }), item(2)]));
    vi.mocked(clearRemixOutputReview).mockRejectedValue(new Error('数据库只读'));
    renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    fireEvent.click(await screen.findByRole('button', { name: '撤销审核' }));
    await waitFor(() => expect(clearRemixOutputReview).toHaveBeenCalledWith('b-1', 1));
    expect(await screen.findByText('审核没有保存')).toBeInTheDocument();
    expect(screen.getByText('数据库只读')).toBeInTheDocument();
  });

  it('restores a rejected record during retention even when the local output is unavailable', async () => {
    const rejected = item(1, {
      outputDeleted: true,
      outputCoverUrl: null,
      review: approved({ decision: 'rejected', reasons: ['wrong_framework'], note: '框架不符' }),
      retention: {
        reason: 'rejected', status: 'pending', cleanupAt: '2026-11-02T10:00:00+08:00', cleanedAt: null, canRestore: true,
      },
    });
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail([rejected], { availableCount: 0, plannedCount: 1 }));
    vi.mocked(clearRemixOutputReview).mockResolvedValue(
      detail([
        item(1, {
          review: null,
          retention: {
            reason: 'rejected', status: 'cancelled', cleanupAt: null, cleanedAt: null, canRestore: false,
          },
        }),
      ], { plannedCount: 1 }),
    );
    renderView('/content/ai-studio/outputs?batch=b-1&output=1&review=rejected');
    expect(await screen.findByText('框架用错')).toBeInTheDocument();
    expect(screen.getByText(/恢复后回到待审核，不会自动通过/)).toBeInTheDocument();
    expect(createContentAssetPlaybackUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '撤回驳回' }));
    await waitFor(() => expect(clearRemixOutputReview).toHaveBeenCalledWith('b-1', 1));
    expect(await screen.findByRole('button', { name: '通过' })).toBeInTheDocument();
    expect(screen.getAllByText('待审核').length).toBeGreaterThan(0);
  });

  it('keeps expired rejected records read-only and blocks A/R shortcuts', async () => {
    const rejected = item(1, {
      outputDeleted: true,
      outputCoverUrl: null,
      review: approved({ decision: 'rejected', reasons: ['frame_drop'] }),
      retention: {
        reason: 'rejected', status: 'completed', cleanupAt: '2026-10-29T10:00:00+08:00',
        cleanedAt: '2026-10-29T10:05:00+08:00', canRestore: false,
      },
    });
    const nextRejected = item(2, {
      review: approved({ decision: 'rejected', reasons: ['wrong_framework'] }),
      retention: {
        reason: 'rejected', status: 'pending', cleanupAt: '2026-11-05T10:00:00+08:00', cleanedAt: null, canRestore: true,
      },
    });
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail([rejected, nextRejected], { availableCount: 1, plannedCount: 2 }));
    const router = renderView('/content/ai-studio/outputs?batch=b-1&output=1&review=rejected');
    expect(await screen.findByText('本地成片已清理，不能撤回；审核原因与来源记录仍会保留。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '撤回驳回' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'r' });
    expect(reviewRemixOutput).not.toHaveBeenCalled();
    expect(clearRemixOutputReview).not.toHaveBeenCalled();
    expect(createContentAssetPlaybackUrl).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'n' });
    await waitFor(() => expect(router.state.location.search).toBe('?batch=b-1&output=2&review=rejected'));
  });

  it.each(['pending', 'deleting', 'failed'])('does not claim deletion before cleanup completes (%s)', async (status) => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail([item(1, {
      outputDeleted: true,
      review: approved({ decision: 'rejected', reasons: ['frame_drop'] }),
      retention: { reason: 'rejected', status, cleanupAt: '2026-10-29T10:00:00+08:00', cleanedAt: null, canRestore: false },
    })]));
    renderView('/content/ai-studio/outputs?batch=b-1&output=1&review=rejected');
    expect(await screen.findByText('这条已驳回成片当前不可播放或下载；审核与来源记录仍会保留。')).toBeInTheDocument();
    expect(screen.queryByText('这条已驳回成片的本地文件已清理，无法再播放或下载。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '撤回驳回' })).not.toBeInTheDocument();
  });

  it('plays a delivered output from Cloud Manager after local cleanup', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail([
      item(1, {
        outputDeleted: true,
        outputCoverUrl: null,
        review: approved(),
        delivery: delivery({ status: 'succeeded', cloudVideoId: 'cloud-42', errorCode: null, canRetry: false }),
        retention: {
          reason: 'delivered', status: 'completed', cleanupAt: null, cleanedAt: '2026-10-30T10:00:00+08:00', canRestore: false,
        },
      }),
    ], { availableCount: 0, plannedCount: 1 }));
    renderView('/content/ai-studio/outputs?batch=b-1&output=1');
    expect(await screen.findByLabelText('第 1 条成片')).toHaveAttribute('src', PLAYBACK.url);
    expect(createContentAssetPlaybackUrl).toHaveBeenCalledWith('out-1', 'raw');
    expect(screen.getByText(/播放已改用云管家/)).toBeInTheDocument();
  });

  it('offers no review for an output that is not in the library', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(
      detail([item(1, { outputDeleted: true, outputCoverUrl: null })], { availableCount: 0, reviewableCount: 0, plannedCount: 1 }),
    );
    renderView('/content/ai-studio/outputs?batch=b-1&output=1&mode=framework');
    expect(await screen.findByText('这条成片已删除，无法再播放或下载。')).toBeInTheDocument();
    expect(screen.getByText('成片生成完成且未删除时才能审核。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '通过' })).not.toBeInTheDocument();
    expect(createContentAssetPlaybackUrl).not.toHaveBeenCalled();
    // A one-output batch goes back to the list, on the tab it came from.
    expect(screen.getByRole('link', { name: '全部批次' })).toHaveAttribute('href', '/content/ai-studio/outputs?mode=framework');
  });

  it('says so for an output the batch does not have', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue(detail());
    renderView('/content/ai-studio/outputs?batch=b-1&output=7');
    expect(await screen.findByText('这个批次没有第 7 条成片')).toBeInTheDocument();
  });
});

describe('成片 review status on the list', () => {
  it('opens a one-output batch on its review page and moves all-rejected batches to the archive', async () => {
    serveBatches([
      batch({ batchId: 'b-one', productName: '口红', plannedCount: 1, requestedCount: 1, status: 'succeeded', failedCount: 0 }),
      batch({ batchId: 'b-done', productName: '眉笔', status: 'succeeded', failedCount: 0, succeededCount: 2, availableCount: 2, reviewableCount: 2, approvedCount: 1, rejectedCount: 1 }),
      batch({ batchId: 'b-no', productName: '散粉', status: 'succeeded', failedCount: 0, rejectedCount: 1 }),
    ]);
    renderView('/content/ai-studio/outputs');
    const one = await screen.findByRole('link', { name: '口红 · 混剪口播 → 实拍内容' });
    expect(one).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-one&output=1');
    expect(within(one).getByText('待审核')).toBeInTheDocument();
    const done = screen.getByRole('link', { name: '眉笔 · 混剪口播 → 实拍内容' });
    expect(within(done).getByText('已通过')).toBeInTheDocument();
    expect(within(done).getByText('已通过 1')).toBeInTheDocument();
    expect(within(done).getByText('已驳回 1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '散粉 · 混剪口播 → 实拍内容' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '已驳回：2 个保留已驳回记录的批次' }));
    expect(within(await screen.findByRole('link', { name: '散粉 · 混剪口播 → 实拍内容' })).getByText('已驳回')).toBeInTheDocument();
  });
});
