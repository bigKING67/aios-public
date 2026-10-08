import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APIError } from '@/lib/request';
import { controlEditingRun, editingKeys, fetchEditingResult, fetchEditingRun, type EditingDetail, type EditingRequest } from '../_lib/content-editing-api';
import { editingActions } from '../_lib/content-editing-state';
import { ContentEditingPlan } from './content-editing-plan';
import { ContentEditingWorkspace } from './content-editing-workspace';
import { ContentEditingResult } from './content-editing-result';
import { useContentAssetsClientState } from './use-content-assets-client-state';
import { useContentEditing } from './use-content-editing';

vi.mock('../_lib/content-editing-api', async (original) => ({ ...await original<object>(), controlEditingRun: vi.fn(), fetchEditingResult: vi.fn(), fetchEditingRun: vi.fn() }));
vi.mock('../_lib/content-production-api', async (original) => ({ ...await original<object>(), fetchProductionCapabilities: vi.fn().mockResolvedValue({ enabled: true, persistentPlansEnabled: true, planningEnabled: true, canWrite: true }) }));
const request: EditingRequest = { idempotencyKey: 'same-request', title: '口播改版', brief: '保留产品细节', taskType: 'smart', assetIds: ['asset-1'], aspect: 'portrait', targetSeconds: 30, reviewBeforeProduction: false, modelCallConfirmed: true, rightsConfirmed: true };
function fixture(status: EditingDetail['run']['status'] = 'waiting', version = 3): EditingDetail {
  return { run: { runId: 'run-1', version, executionVersion: 1, planRevision: 1, status, stage: 'planning', waitingReason: 'awaiting_plan_confirmation', request, projectId: null, projectRevision: null, renderJobId: null, pauseRequested: false, createdAt: '', updatedAt: '' }, plan: { revision: 1, executionVersion: 1, origin: 'model', createdAt: '', document: { summary: '先展示场景', clips: [{ id: 'c1', assetId: 'asset-1', startMs: 0, endMs: 3000, caption: '细节', volume: 1 }], reasons: ['台词明确说明用途'], gaps: [], lockedClipIds: ['c1'] } } };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('editing result access', () => {
  it('removes a cached playback link when the current source authorization is rejected', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const run = { ...fixture('succeeded').run, renderJobId: 'render-1' };
    vi.mocked(fetchEditingResult).mockResolvedValueOnce({ ready: true, playbackUrl: '/signed-video.mp4', job: null })
      .mockRejectedValueOnce(new APIError('forbidden', 403, '源素材授权已失效'));
    render(<QueryClientProvider client={client}><ContentEditingResult run={run} /></QueryClientProvider>);
    await screen.findByLabelText('剪辑成片');
    await waitFor(() => expect(client.isFetching()).toBe(0));
    fireEvent.click(screen.getByRole('button', { name: /刷新成片/ }));
    await screen.findByText('源素材授权已失效');
    expect(screen.queryByLabelText('剪辑成片')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '打开视频 / 下载' })).not.toBeInTheDocument();
    client.clear();
  });
});
describe('editing task deep link', () => {
  it('keeps the library on its own modules when a legacy editing link reaches the client state', () => {
    const view = renderHook(() => useContentAssetsClientState(), {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/marketing/content-assets?editingRun=run-1']}>{children}</MemoryRouter>,
    });
    expect(view.result.current.activeModule).toBe('home');
    act(() => view.result.current.setActiveModule('assets'));
    expect(view.result.current.activeModule).toBe('assets');
    view.rerender();
    expect(view.result.current.activeModule).toBe('assets');
  });
  it('keeps the ordinary library entry on its home module', () => {
    const view = renderHook(() => useContentAssetsClientState(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });
    expect(view.result.current.activeModule).toBe('home');
  });
});
describe('editing plan interaction', () => {
  it('requires explicit unlock, saves exact base version, and preserves edits after a conflict', async () => {
    const onSave = vi.fn().mockResolvedValue(false); const onEditing = vi.fn(); const detail = fixture();
    const view = render(<ContentEditingPlan detail={detail} editable busy={false} onSave={onSave} onEditing={onEditing} />);
    fireEvent.click(screen.getByText('修改方案'));
    expect(screen.getByLabelText('片段 1 字幕')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('锁定片段 1'));
    fireEvent.change(screen.getByLabelText('片段 1 字幕'), { target: { value: '新的字幕' } });
    fireEvent.click(screen.getByText('保存方案'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(detail.run, expect.objectContaining({ lockedClipIds: [], clips: [expect.objectContaining({ caption: '新的字幕' })] }), ['c1']));
    expect(screen.getByLabelText('片段 1 字幕')).toHaveValue('新的字幕');
    view.rerender(<ContentEditingPlan detail={fixture('waiting', 4)} editable busy={false} onSave={onSave} onEditing={onEditing} />);
    expect(screen.getByText('任务已有更新，本地修改已保留')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存方案' })).toBeDisabled();
    expect(screen.getByLabelText('片段 1 字幕')).toHaveValue('新的字幕');
  });
  it('blocks produce on gaps and editing while stopping, and never exposes resume for terminal runs', () => {
    const detail = fixture(); detail.plan!.document.gaps = ['缺少产品画面'];
    expect(editingActions(detail).produce).toBe(false);
    detail.run.status = 'running'; detail.run.pauseRequested = true;
    expect(editingActions(detail)).toMatchObject({ edit: false, pause: false, produce: false, resume: false });
    for (const status of ['cancelled', 'succeeded', 'cancelling', 'failed'] as const) expect(editingActions(fixture(status))).toMatchObject({ edit: false, resume: false, cancel: false });
  });
});
describe('editing lifecycle', () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/?editingRun=run-1']}><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
    return { client, ...renderHook(() => useContentEditing(true), { wrapper }) };
  }
  it('a late planning result cannot undo cancellation or reopen a closed task', async () => {
    const queued = fixture('queued', 1); const cancelled = fixture('cancelled', 5);
    let resolvePlan!: (value: EditingDetail) => void;
    vi.mocked(fetchEditingRun).mockResolvedValue(cancelled);
    vi.mocked(controlEditingRun).mockImplementation((_run, action) => action === 'plan' ? new Promise((resolve) => { resolvePlan = resolve; }) : Promise.resolve(cancelled));
    const { result, client } = setup();
    let planning!: Promise<void>;
    act(() => { planning = result.current.plan(queued.run); });
    await act(async () => { await result.current.perform(queued.run, () => controlEditingRun(queued.run, 'cancel')); });
    act(() => result.current.select(null));
    await act(async () => { resolvePlan(fixture('waiting', 3)); await planning; });
    expect(result.current.selected).toBeNull();
    expect(client.getQueryData<EditingDetail>(editingKeys.detail('run-1'))?.run.status).toBe('cancelled');
    client.clear();
  });
  it('does not automatically retry failed planning', async () => {
    vi.mocked(fetchEditingRun).mockResolvedValue(fixture('running', 2));
    const { result, client } = setup();
    vi.mocked(controlEditingRun).mockRejectedValue(new Error('规划请求超时'));
    await act(async () => { await result.current.plan(fixture('queued', 1).run); });
    expect(controlEditingRun).toHaveBeenCalledTimes(1);
    expect(result.current.failure).toContain('超时');
    client.clear();
  });
  it('keeps a local plan draft mounted when refreshing the task fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const detail = fixture(); detail.plan!.document.lockedClipIds = [];
    vi.mocked(fetchEditingRun).mockResolvedValue(detail);
    render(<MemoryRouter initialEntries={['/?editingRun=run-1']}><QueryClientProvider client={client}><ContentEditingWorkspace /></QueryClientProvider></MemoryRouter>);
    fireEvent.click(await screen.findByText('修改方案'));
    fireEvent.change(screen.getByLabelText('片段 1 字幕'), { target: { value: '保留这份草稿' } });
    vi.mocked(fetchEditingRun).mockRejectedValue(new Error('网络连接失败'));
    fireEvent.click(screen.getByText('刷新状态'));
    expect(await screen.findByText('任务未能更新')).toBeInTheDocument();
    expect(screen.getByLabelText('片段 1 字幕')).toHaveValue('保留这份草稿');
    expect(screen.getByRole('button', { name: '保存方案' })).toBeDisabled();
    client.clear();
  });
  it('framework remix plans are frozen: no plan editing, with a pointer to 精修', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const detail = fixture();
    detail.run.request = { ...detail.run.request, taskType: 'framework_remix' } as unknown as EditingRequest; // remix Runs carry a type outside EditingTaskType
    detail.run.waitingReason = 'invalid_render_receipt';
    vi.mocked(fetchEditingRun).mockResolvedValue(detail);
    render(<MemoryRouter initialEntries={['/?editingRun=run-1']}><QueryClientProvider client={client}><ContentEditingWorkspace /></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText(/片段组合在生成时已锁定/)).toBeInTheDocument();
    expect(screen.queryByText('修改方案')).not.toBeInTheDocument();
    expect(screen.getByText('成片检查失败，可重新制作。')).toBeInTheDocument();
    // A failed attempt reads as a failure and its retry says so.
    expect(screen.getByText('失败待处理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新制作' })).toBeInTheDocument();
    // Cancelling asks first; nothing is sent until confirmed.
    fireEvent.click(screen.getByRole('button', { name: '取消任务' }));
    expect(await screen.findByText('取消这个任务？')).toBeInTheDocument();
    expect(controlEditingRun).not.toHaveBeenCalled();
    client.clear();
  });
  it('no longer offers creating tasks or a task list without a task link', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><ContentEditingWorkspace /></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText('没有指定剪辑任务')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始剪辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '最近剪辑任务' })).not.toBeInTheDocument();
    client.clear();
  });
});
