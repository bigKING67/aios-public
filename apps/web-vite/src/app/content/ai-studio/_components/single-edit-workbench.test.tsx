import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAllStudioSegments,
  fetchStudioPresets,
  type StudioCapabilitiesResponse,
  type StudioContentSegment,
} from '../_lib/ai-studio-api';
import {
  checkRemixEdit,
  createRemixEdit,
  fetchRemixBatch,
  fetchRemixBatches,
  type StudioRemixEditCheckResponse,
  type StudioRemixEditMatch,
} from '../_lib/remix-api';
import { useAuthStore } from '@/stores/auth.store';
import { SingleEditPanel } from './single-edit-workbench';

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
  checkRemixEdit: vi.fn(),
  createRemixEdit: vi.fn(),
  fetchRemixBatch: vi.fn(),
  fetchRemixBatches: vi.fn(),
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

function segment(id: string, extra: Partial<StudioContentSegment> = {}): StudioContentSegment {
  return {
    segmentId: id, ownerUserId: 'u', assetId: 'a-1', assetTitle: '百雀羚整片-001.mp4', sourceContentHash: 'h', sourceCurrent: true,
    sourceDurationMs: 60_000, startMs: 0, endMs: 8_000, presetKey: 'framework', presetVersion: 1, labelKey: 'voice',
    productName: '精华', origin: 'human', status: 'confirmed', evidence: null, revision: 1, confirmedBy: 'u', confirmedAt: null,
    createdAt: '', updatedAt: '', coverUrl: null, ...extra,
  };
}

const SEGMENTS = [
  segment('s-voice'),
  segment('s-demo', { labelKey: 'demo', startMs: 10_000, endMs: 16_000 }),
  segment('s-other', { assetId: 'a-2', assetTitle: '面霜整片.mp4', productName: '面霜', labelKey: 'demo' }),
];

function match(extra: Partial<StudioRemixEditMatch> = {}): StudioRemixEditMatch {
  return {
    batchId: 'b-old', ordinal: 1, mode: 'edit', productName: '精华', outcome: 'succeeded', outputAssetId: 'o-1',
    outputCoverUrl: null, durationMs: 14_000, overlap: 1, createdAt: '2026-10-01T02:00:00Z', ...extra,
  };
}

function checkResult(extra: Partial<StudioRemixEditCheckResponse> = {}): StudioRemixEditCheckResponse {
  return { productName: '精华', durationMs: 14_000, exact: [], similar: [], ...extra };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="当前地址">{`${location.pathname}${location.search}`}</output>;
}

function renderPanel(caps = capabilities(), entry = '/content/ai-studio/editing?mode=single') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 1, retryDelay: 1 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/content/ai-studio/editing" element={<SingleEditPanel capabilities={caps} />} />
          <Route path="/content/ai-studio/outputs" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function addFromLibrary(name: RegExp) {
  const drawer = await screen.findByRole('dialog', { name: '从片段库添加' });
  const item = within(drawer).getByText(name).closest('li') as HTMLElement;
  fireEvent.click(within(item).getByRole('button', { name: /^添\s?加$/ }));
}

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ user: { id: 'u-1' } as never });
  vi.mocked(fetchStudioPresets).mockResolvedValue([PRESET]);
  vi.mocked(fetchAllStudioSegments).mockResolvedValue({ items: SEGMENTS, truncated: false });
  vi.mocked(fetchRemixBatches).mockResolvedValue([]);
  vi.mocked(checkRemixEdit).mockResolvedValue(checkResult());
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('单条剪辑 workbench', () => {
  it('is honest when rendering is off and never checks or creates', async () => {
    renderPanel(capabilities({ remixEnabled: false }));
    expect(screen.getByRole('heading', { name: '单条剪辑未启用' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkRemixEdit).not.toHaveBeenCalled();
    expect(fetchAllStudioSegments).not.toHaveBeenCalled();
  });

  it('builds an edit from the library, limits it to one product and trims inside the segment', async () => {
    renderPanel();
    expect(await screen.findByRole('button', { name: /AI 先起草/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /从片段库挑着拼/ }));
    await addFromLibrary(/面霜整片/);
    // The first clip fixes the product; other products leave the library.
    await waitFor(() => expect(screen.queryByText(/只显示「面霜」的片段/)).toBeInTheDocument());
    expect(within(screen.getByRole('dialog', { name: '从片段库添加' })).queryByText('百雀羚整片-001.mp4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: /删除/ }));
    expect(await screen.findByRole('button', { name: /从片段库挑着拼/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /从片段库挑着拼/ }));
    await addFromLibrary(/^混剪口播$/);
    await addFromLibrary(/^实拍内容$/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const timeline = screen.getByRole('list', { name: '剪辑台片段' });
    expect(within(timeline).getAllByRole('button', { name: /^第 \d 段/ })).toHaveLength(2);
    // Arrow keys move the out-point handle; it stops at the segment's end.
    const outPoint = screen.getByRole('slider', { name: '出点' });
    fireEvent.keyDown(outPoint, { key: 'ArrowLeft', keyCode: 37, which: 37 });
    expect(screen.getByText(/出点 0:15\.9/)).toBeInTheDocument();
    fireEvent.keyDown(outPoint, { key: 'ArrowRight', keyCode: 39, which: 39 });
    fireEvent.keyDown(outPoint, { key: 'ArrowRight', keyCode: 39, which: 39 });
    expect(screen.getByText(/出点 0:16\.0/)).toBeInTheDocument();
    await waitFor(() => expect(checkRemixEdit).toHaveBeenLastCalledWith(
      { presetKey: 'framework', presetVersion: 1, clips: [
        { segmentId: 's-voice', startMs: 0, endMs: 8_000 },
        { segmentId: 's-demo', startMs: 10_000, endMs: 16_000 },
      ] },
      expect.anything(),
    ));
    expect(await screen.findByText('没有重复或相似的成片。')).toBeInTheDocument();
  });

  it('blocks an exact repeat until 仍然生成 and submits once with allowDuplicate', async () => {
    vi.mocked(checkRemixEdit).mockResolvedValue(checkResult({
      exact: [match()],
      similar: [match({ batchId: 'b-fw', mode: 'framework', ordinal: 2, overlap: 0.86 })],
    }));
    vi.mocked(createRemixEdit).mockResolvedValue({ batch: { batchId: 'b-new' }, items: [] } as never);
    window.localStorage.setItem('aiStudio.singleEditDraft.v3:u-1:framework:1', JSON.stringify({
      presetKey: 'framework', presetVersion: 1,
      clips: [{ segmentId: 's-voice', startMs: 0, endMs: 8_000 }, { segmentId: 's-demo', startMs: 10_000, endMs: 16_000 }],
    }));
    renderPanel();
    expect(await screen.findByText('已有完全相同的成片')).toBeInTheDocument();
    expect(screen.getByText('有 1 条相似成片')).toBeInTheDocument();
    expect(screen.getByText(/重叠 86%/)).toBeInTheDocument();
    const generate = screen.getByRole('button', { name: '生成这条成片' });
    expect(generate).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '仍然生成' }));
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    fireEvent.click(await screen.findByRole('button', { name: '开始生成' }));
    await waitFor(() => expect(screen.getByLabelText('当前地址')).toHaveTextContent('/content/ai-studio/outputs?batch=b-new'));
    expect(createRemixEdit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createRemixEdit).mock.calls[0][0]).toMatchObject({
      presetKey: 'framework', presetVersion: 1, allowDuplicate: true,
      idempotencyKey: expect.stringMatching(/^remix-/),
      clips: [{ segmentId: 's-voice', startMs: 0, endMs: 8_000 }, { segmentId: 's-demo', startMs: 10_000, endMs: 16_000 }],
    });
  });

  it('starts from an output deep link and flags clips that are no longer usable', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({
      batch: { batchId: 'b-old', status: 'succeeded', presetKey: 'framework', presetVersion: 1 },
      items: [{
        ordinal: 2, outcome: 'succeeded',
        segments: [
          { segmentId: 's-demo', assetId: 'a-1', assetTitle: '', labelKey: 'demo', startMs: 11_000, endMs: 15_000 },
          { segmentId: 's-gone', assetId: 'a-1', assetTitle: '', labelKey: 'voice', startMs: 0, endMs: 5_000 },
        ],
      }],
    } as never);
    renderPanel(capabilities(), '/content/ai-studio/editing?mode=single&fromBatch=b-old&ordinal=2');
    const timeline = await screen.findByRole('list', { name: '剪辑台片段' });
    expect(within(timeline).getByRole('button', { name: /第 1 段：实拍内容 4\.0 秒/ })).toBeInTheDocument();
    expect(within(timeline).getByRole('button', { name: /第 2 段：片段不可用.*（不可用）/ })).toBeInTheDocument();
    expect(await screen.findByText('1 段已不可用（取消确认或原片更新），请删除或替换。')).toBeInTheDocument();
    expect(checkRemixEdit).not.toHaveBeenCalled();
  });
});

describe('单条剪辑 deep link failures', () => {
  it('refuses an output built on another preset version with a clear reason', async () => {
    vi.mocked(fetchRemixBatch).mockResolvedValue({
      batch: { batchId: 'b-v2', status: 'succeeded', presetKey: 'framework', presetVersion: 2 },
      items: [{ ordinal: 1, outcome: 'succeeded', segments: [] }],
    } as never);
    renderPanel(capabilities(), '/content/ai-studio/editing?mode=single&fromBatch=b-v2&ordinal=1');
    expect(await screen.findByText(/分类预设 v2/)).toBeInTheDocument();
  });
  it('reports an output link that cannot be loaded instead of silently ignoring it', async () => {
    vi.mocked(fetchRemixBatch).mockRejectedValue(new Error('not found'));
    renderPanel(capabilities(), '/content/ai-studio/editing?mode=single&fromBatch=b-gone&ordinal=1');
    expect(await screen.findByText(/没能读取这条成片/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /从片段库挑着拼/ })).toBeInTheDocument();
  });
});
