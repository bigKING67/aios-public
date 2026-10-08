import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllStudioSegments, fetchStudioPresets, type StudioCapabilitiesResponse } from '../_lib/ai-studio-api';
import {
  createRemixBatch,
  fetchRemixBatches,
  fetchRemixProducts,
  previewRemixBatch,
  type StudioRemixBatch,
  type StudioRemixBatchPreviewResponse,
} from '../_lib/remix-api';
import { buildRemixPreviewRequest } from '../_lib/remix-form';
import { FrameworkRemixPanel } from './framework-remix-panel';

vi.mock('@/app/marketing/content-assets/_lib/content-assets-api', async (original) => ({
  ...await original<object>(),
  createContentAssetPlaybackUrl: vi.fn().mockResolvedValue({ url: 'https://tos.invalid/raw.mp4', expiresAt: '' }),
}));

vi.mock('../_lib/ai-studio-api', async (original) => ({
  ...await original<object>(),
  fetchStudioPresets: vi.fn(),
  fetchAllStudioSegments: vi.fn(),
}));
vi.mock('../_lib/remix-api', async (original) => ({
  ...await original<object>(),
  createRemixBatch: vi.fn(),
  fetchRemixBatches: vi.fn(),
  fetchRemixProducts: vi.fn(),
  previewRemixBatch: vi.fn(),
}));

const PRESET = {
  presetKey: 'framework', version: 1, status: 'active', dimension: 'framework', name: '框架 v1',
  labels: [
    { key: 'voice', name: '混剪口播', definition: '' },
    { key: 'demo', name: '实拍内容', definition: '' },
  ],
};

function capabilities(extra: Partial<StudioCapabilitiesResponse> = {}): StudioCapabilitiesResponse {
  return {
    enabled: true, openAccess: false, canWrite: true, segmentSuggestEnabled: false, segmentSuggestMaxAssets: 5,
    remixEnabled: true, remixMaxPerBatch: 10, remixMaxSeconds: 600, remixMaxActive: 20, enterpriseTag: null, products: [], canUpload: true, ...extra,
  };
}

function preview(extra: Partial<StudioRemixBatchPreviewResponse> = {}): StudioRemixBatchPreviewResponse {
  return {
    labels: ['voice', 'demo'], sourceAssetId: null, productName: '精华',
    slots: [{ ordinal: 1, labelKey: 'voice', candidateCount: 2 }, { ordinal: 2, labelKey: 'demo', candidateCount: 1 }],
    missingLabels: [], excludedAssetCount: 1, theoreticalCombinations: 2, availableCombinations: 2,
    availableIsLowerBound: false, previouslyUsedCombinations: 0, referenceCombinationExcluded: false, requestedCount: 3, plannableCount: 2,
    shortfallReason: '可用组合只有 2 种，少于请求的 3 条', seed: 7, ...extra,
  };
}

function batch(extra: Partial<StudioRemixBatch> = {}): StudioRemixBatch {
  return {
    batchId: 'b-9', mode: 'framework', ownerUserId: 'u2', ownerName: '小王', ownedByCurrentUser: false, presetKey: 'framework', presetVersion: 1,
    labels: ['voice', 'demo'], sourceAssetId: null, productName: '精华', requestedCount: 3, plannedCount: 3, seed: 1,
    status: 'running', shortfallReason: null, succeededCount: 1, failedCount: 0, runningCount: 2, cancelledCount: 0,
    coverUrls: [], failureReason: null,
    createdAt: '2026-10-01T02:00:00Z', updatedAt: '2026-10-01T02:00:00Z', ...extra,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="当前地址">{`${location.pathname}${location.search}`}</output>;
}

function renderPanel(caps: StudioCapabilitiesResponse) {
  // Mirror the app default (mutations retry once) to prove the write opts out.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 1, retryDelay: 1 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/content/ai-studio/editing?mode=remix']}>
        <Routes>
          <Route path="/content/ai-studio/editing" element={<FrameworkRemixPanel capabilities={caps} />} />
          <Route path="/content/ai-studio/outputs" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function chooseOption(label: string, option: string) {
  fireEvent.mouseDown(await screen.findByLabelText(label));
  fireEvent.click(await screen.findByTitle(option));
}

async function fillManualForm() {
  fireEvent.click(await screen.findByRole('radio', { name: '手动排列框架顺序' }));
  fireEvent.click(screen.getByRole('button', { name: /添加一位/ }));
  fireEvent.click(screen.getByRole('button', { name: /添加一位/ }));
  await chooseOption('第 2 位框架', '实拍内容');
  await chooseOption('产品', '精华（3 段）');
}

beforeEach(() => {
  vi.mocked(fetchStudioPresets).mockResolvedValue([PRESET]);
  vi.mocked(fetchAllStudioSegments).mockResolvedValue({ items: [], truncated: false });
  vi.mocked(fetchRemixProducts).mockResolvedValue([{ productName: '精华', confirmedSegmentCount: 3 }]);
  vi.mocked(previewRemixBatch).mockResolvedValue(preview());
  vi.mocked(fetchRemixBatches).mockResolvedValue([]);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('框架混剪 panel', () => {
  it('is honest when remix is off and never previews or submits', async () => {
    renderPanel(capabilities({ remixEnabled: false }));
    expect(screen.getByRole('heading', { name: '框架混剪未启用' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /成片/ })).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(previewRemixBatch).not.toHaveBeenCalled();
    expect(fetchRemixProducts).not.toHaveBeenCalled();
    expect(fetchRemixBatches).not.toHaveBeenCalled();
  });

  it('previews the manual structure and submits once with an idempotency key', async () => {
    vi.mocked(createRemixBatch).mockResolvedValue({ batch: { batchId: 'b-1' }, items: [] } as never);
    renderPanel(capabilities());
    await fillManualForm();
    await waitFor(() => expect(previewRemixBatch).toHaveBeenLastCalledWith(
      { presetKey: 'framework', presetVersion: 1, labels: ['voice', 'demo'], productName: '精华', count: 3 },
      expect.anything(),
    ));
    expect(await screen.findByText('2 / 3 条')).toBeInTheDocument();
    expect(screen.getByText('可用组合只有 2 种，少于请求的 3 条')).toBeInTheDocument();
    expect(screen.getByText(/1 条原片因授权受限/)).toBeInTheDocument();
    const slots = screen.getByRole('list', { name: '框架结构' });
    expect(within(slots).getByText('实拍内容')).toBeInTheDocument();
    expect(within(slots).getByText('1 段')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '生成 2 条成片' }));
    expect(await screen.findByText(/单通道依次处理/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '开始生成' }));
    await waitFor(() => expect(createRemixBatch).toHaveBeenCalledTimes(1));
    const request = vi.mocked(createRemixBatch).mock.calls[0][0];
    expect(request).toMatchObject({ labels: ['voice', 'demo'], productName: '精华', count: 3, presetKey: 'framework' });
    expect(request.idempotencyKey).toMatch(/^remix-[A-Za-z0-9_-]+$/);
    expect(await screen.findByLabelText('当前地址')).toHaveTextContent('/content/ai-studio/outputs?batch=b-1');
  });

  it('debounces rapid input changes into one preview of the final request', async () => {
    renderPanel(capabilities());
    await fillManualForm();
    await waitFor(() => expect(previewRemixBatch).toHaveBeenCalledTimes(1));
    const count = screen.getByLabelText(/生成数量/);
    fireEvent.change(count, { target: { value: '4' } });
    fireEvent.change(count, { target: { value: '5' } });
    expect(screen.getByRole('button', { name: /成片$/ })).toBeDisabled();
    await waitFor(() => expect(previewRemixBatch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(previewRemixBatch).mock.calls[1][0]).toMatchObject({ count: 5 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(previewRemixBatch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failed submission and blocks submit without plannable combinations', async () => {
    vi.mocked(createRemixBatch).mockRejectedValue(new Error('排队中的框架混剪已有 20 条'));
    renderPanel(capabilities());
    await fillManualForm();
    fireEvent.click(await screen.findByRole('button', { name: '生成 2 条成片' }));
    fireEvent.click(await screen.findByRole('button', { name: '开始生成' }));
    expect(await screen.findByText('批次提交失败')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(createRemixBatch).toHaveBeenCalledTimes(1);
  });

  it('disables submit when nothing can be generated and for read-only users', async () => {
    vi.mocked(previewRemixBatch).mockResolvedValue(preview({
      plannableCount: 0, missingLabels: ['demo'], shortfallReason: 'x',
      slots: [{ ordinal: 1, labelKey: 'voice', candidateCount: 2 }, { ordinal: 2, labelKey: 'demo', candidateCount: 0 }],
    }));
    renderPanel(capabilities());
    await fillManualForm();
    expect(await screen.findByText('缺少可用片段的框架：实拍内容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /成片$/ })).toBeDisabled();
    expect(screen.getByText('缺少可用片段：实拍内容。')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '框架结构' })).getByText('待补')).toBeInTheDocument();
    cleanup();
    renderPanel(capabilities({ canWrite: false }));
    expect(await screen.findByText('当前账号没有素材编辑权限，只能查看。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /成片$/ })).toBeDisabled();
  });
});

describe('框架混剪 workbench', () => {
  it('names what is missing before anything can be generated', async () => {
    renderPanel(capabilities());
    expect(await screen.findByText('先选择产品。')).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: '生成步骤' });
    expect(within(steps).getByText('选择产品')).toBeInTheDocument();
    expect(within(steps).getByText('选一条参考原片定结构')).toBeInTheDocument();
    expect(screen.getByText('框架标签 v1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /成片$/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: '单条剪辑' })).toHaveAttribute('href', '/content/ai-studio/editing?mode=single');
  });

  it('takes the product from the picked reference original', async () => {
    vi.mocked(fetchAllStudioSegments).mockResolvedValue({
      items: [
        { assetId: 'a1', assetTitle: '整片-001', labelKey: 'voice', startMs: 0, sourceCurrent: true, productName: '精华', presetVersion: 1 },
        { assetId: 'a1', assetTitle: '整片-001', labelKey: 'demo', startMs: 9000, sourceCurrent: true, productName: '精华', presetVersion: 1 },
      ],
      truncated: false,
    } as never);
    renderPanel(capabilities());
    const card = await screen.findByRole('button', { name: '选择参考原片 整片-001' });
    expect(within(card).getByText('混剪口播 → 实拍内容')).toBeInTheDocument();
    expect(within(card).getByText('精华 · 2 段')).toBeInTheDocument();
    fireEvent.click(card);
    // Picked: the cards collapse to one line that can be undone.
    expect(within(await screen.findByLabelText('已选参考原片')).getByRole('button', { name: '换一个' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '参考原片' })).not.toBeInTheDocument();
    await waitFor(() => expect(previewRemixBatch).toHaveBeenLastCalledWith(
      { presetKey: 'framework', presetVersion: 1, sourceAssetId: 'a1', productName: '精华', count: 3 },
      expect.anything(),
    ));
  });

  it('lists recent batches with progress and a link to their outputs', async () => {
    vi.mocked(fetchRemixBatches).mockResolvedValue([batch()]);
    renderPanel(capabilities({ openAccess: true }));
    const list = await screen.findByRole('list', { name: '最近批次' });
    expect(within(list).getByText('混剪口播 → 实拍内容')).toBeInTheDocument();
    expect(within(list).getByText(/完成 1 \/ 3 条 · 渲染中 2 · /)).toBeInTheDocument();
    expect(within(list).getByText(/小王/)).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: '查看成片' })).toHaveAttribute('href', '/content/ai-studio/outputs?batch=b-9');
  });
});

describe('候选片段', () => {
  it('lists each framework pool once and plays a candidate in place', async () => {
    const seg = (segmentId: string, labelKey: string, startMs: number, productName = '精华') => ({
      segmentId, assetId: 'a1', assetTitle: '整片-001', labelKey, startMs, endMs: startMs + 6000, presetVersion: 1,
      productName, sourceCurrent: true, coverUrl: null,
    });
    vi.mocked(fetchAllStudioSegments).mockResolvedValue({
      items: [seg('v1', 'voice', 0), seg('v2', 'voice', 20000), seg('d1', 'demo', 9000), seg('d2', 'demo', 30000, '面霜')],
      truncated: false,
    } as never);
    renderPanel(capabilities());
    await fillManualForm();
    const voice = await screen.findByRole('region', { name: '候选片段：混剪口播' });
    expect(within(voice).getByText('第 1 位 · 2 段')).toBeInTheDocument();
    expect(within(voice).getAllByRole('button')).toHaveLength(2);
    const demo = screen.getByRole('region', { name: '候选片段：实拍内容' });
    expect(within(demo).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(voice).getByRole('button', { name: '播放 整片-001 0:20–0:26' }));
    expect(await screen.findByLabelText('片段播放器：整片-001 0:20–0:26')).toHaveAttribute('src', 'https://tos.invalid/raw.mp4');
  });
});

describe('buildRemixPreviewRequest', () => {
  it('names the missing input instead of building a partial request', () => {
    expect(buildRemixPreviewRequest(null, { mode: 'manual', labels: ['voice'] }, '精华', 1)).toBe('没有可用的分类预设。');
    expect(buildRemixPreviewRequest(PRESET, { mode: 'reference', sourceAssetId: null }, '精华', 1)).toMatch(/参考原片/);
    expect(buildRemixPreviewRequest(PRESET, { mode: 'manual', labels: [] }, '精华', 1)).toMatch(/至少添加/);
    expect(buildRemixPreviewRequest(PRESET, { mode: 'manual', labels: ['voice'] }, null, 1)).toMatch(/产品/);
    expect(buildRemixPreviewRequest(PRESET, { mode: 'manual', labels: ['voice'] }, '精华', null)).toMatch(/数量/);
    expect(buildRemixPreviewRequest(PRESET, { mode: 'reference', sourceAssetId: 'a1' }, '精华', 2)).toEqual({
      presetKey: 'framework', presetVersion: 1, sourceAssetId: 'a1', productName: '精华', count: 2,
    });
  });
});
