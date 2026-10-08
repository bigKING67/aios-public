import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContentAssetDetail, createContentAssetPlaybackUrl } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { APIError } from '@/lib/request';
import {
  confirmStudioSegments,
  fetchAllStudioSegments,
  fetchStudioPresets,
  fetchStudioSegments,
  type StudioContentSegment,
  updateStudioSegment,
} from '../_lib/ai-studio-api';
import { SegmentsWorkspace } from './segments-workspace';

vi.mock('@/app/marketing/content-assets/_lib/content-assets-api', () => ({
  fetchContentAssetDetail: vi.fn(),
  createContentAssetPlaybackUrl: vi.fn(),
  fetchContentAssets: vi.fn(),
}));
vi.mock('../_lib/ai-studio-api', async (original) => ({
  ...await original<object>(),
  fetchStudioPresets: vi.fn(),
  fetchStudioSegments: vi.fn(),
  fetchAllStudioSegments: vi.fn(),
  updateStudioSegment: vi.fn(),
  confirmStudioSegments: vi.fn(),
  createStudioSegment: vi.fn(),
}));

const ASSET = '9f9f9f9f-0000-4000-8000-000000000001';
const CONFIRMED = '11111111-1111-4111-8111-111111111111';
const SUGGESTED = '22222222-2222-4222-8222-222222222222';
const STALE = '33333333-3333-4333-8333-333333333333';

function segment(segmentId: string, status: string, startMs: number, endMs: number, extra: Partial<StudioContentSegment> = {}): StudioContentSegment {
  return {
    segmentId, status, startMs, endMs, assetId: ASSET, assetTitle: '整片-001', ownerUserId: 'u1',
    sourceContentHash: 'a'.repeat(64), sourceCurrent: true, sourceDurationMs: 60_000, presetKey: 'framework', presetVersion: 1,
    labelKey: 'street', productName: '小紫瓶', origin: status === 'suggested' ? 'ai' : 'human', evidence: {}, revision: 1,
    confirmedBy: null, confirmedAt: null, createdAt: '', updatedAt: '', coverUrl: null, ...extra,
  };
}

function renderWorkspace(entry: string, canWrite = true, openAccess = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <SegmentsWorkspace canWrite={canWrite} openAccess={openAccess} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // The annotation view pages through the same list endpoint.
  vi.mocked(fetchAllStudioSegments).mockImplementation(async (query) => ({
    items: (await fetchStudioSegments(query)).items,
    truncated: false,
  }));
  vi.mocked(fetchStudioPresets).mockResolvedValue([{
    presetKey: 'framework', version: 1, dimension: 'framework', name: '框架', status: 'active',
    labels: [{ key: 'street', name: '街采', definition: '路人采访' }, { key: 'mechanism', name: '机制', definition: '价格机制' }],
  }]);
  vi.mocked(fetchContentAssetDetail).mockResolvedValue({
    asset: {
      assetId: ASSET, title: '整片-001', canEdit: true, rawSha256: 'a'.repeat(64), durationSeconds: 60, productName: '小紫瓶',
      productNames: ['小紫瓶'], externalOnly: false, rawObjectKey: 'raw.mp4', previewObjectKey: null, coverUrl: null,
    },
  } as never);
  vi.mocked(createContentAssetPlaybackUrl).mockResolvedValue({ url: 'https://example.test/raw.mp4', variant: 'raw', expiresAt: '', provider: 'tos_signed_url', contentType: 'video/mp4', fileSizeBytes: null });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('segment annotation view', () => {
  it('lists the asset segments, keeps stale rows read-only and plays the raw source', async () => {
    vi.mocked(fetchStudioSegments).mockResolvedValue({
      items: [segment(CONFIRMED, 'confirmed', 0, 10_000), segment(SUGGESTED, 'suggested', 5_000, 12_000), segment(STALE, 'stale', 20_000, 30_000)],
      nextCursor: null,
      assets: [],
    });
    renderWorkspace(`/content/ai-studio/segments?assetId=${ASSET}`);

    expect(await screen.findByRole('heading', { name: /标注片段 · 整片-001/ })).toBeInTheDocument();
    expect(vi.mocked(fetchStudioSegments).mock.calls[0][0]).toMatchObject({ assetId: ASSET, presetKey: 'framework' });
    expect(await screen.findByLabelText('原片播放器')).toHaveAttribute('src', 'https://example.test/raw.mp4');
    expect(createContentAssetPlaybackUrl).toHaveBeenCalledWith(ASSET, 'raw');
    const timeline = screen.getByRole('group', { name: '片段时间轴' });
    expect(within(timeline).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('原片已变化，只读')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /编\s*辑/ })).toHaveLength(2);
    expect(screen.getByRole('form', { name: '新建片段' })).toBeInTheDocument();
  });

  it('maps an overlap conflict onto the named row', async () => {
    vi.mocked(fetchStudioSegments).mockResolvedValue({
      items: [segment(CONFIRMED, 'confirmed', 0, 10_000), segment(SUGGESTED, 'suggested', 5_000, 12_000)],
      nextCursor: null,
      assets: [],
    });
    vi.mocked(updateStudioSegment).mockRejectedValue(new APIError('CONFLICT', 409, `与已确认片段时间重叠：${CONFIRMED}`));
    renderWorkspace(`/content/ai-studio/segments?assetId=${ASSET}`);

    fireEvent.click(await screen.findByRole('button', { name: /^确\s*认$/ }));
    expect(await screen.findByText(/与已确认片段时间重叠（街采 0:00\.0–0:10\.0）/)).toBeInTheDocument();
    expect(updateStudioSegment).toHaveBeenCalledWith(SUGGESTED, { expectedRevision: 1, status: 'confirmed' });
    const conflictRow = document.querySelector(`[data-row-key="${CONFIRMED}"]`);
    expect(conflictRow?.className).toMatch(/rowConflict/);
  });

  it('confirms selected suggestions as one all-or-nothing batch', async () => {
    vi.mocked(fetchStudioSegments).mockResolvedValue({ items: [segment(SUGGESTED, 'suggested', 5_000, 12_000, { revision: 3 })], nextCursor: null, assets: [] });
    vi.mocked(confirmStudioSegments).mockResolvedValue([segment(SUGGESTED, 'confirmed', 5_000, 12_000)]);
    renderWorkspace(`/content/ai-studio/segments?assetId=${ASSET}`);

    fireEvent.click(await screen.findByRole('checkbox', { name: '选择片段 0:05.0' }));
    fireEvent.click(screen.getByRole('button', { name: /批量确认 1 条/ }));
    expect(await screen.findByText(/本次不会确认任何片段/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^确\s*认$/ }).at(-1)!);
    await waitFor(() => expect(confirmStudioSegments).toHaveBeenCalledWith([{ segmentId: SUGGESTED, expectedRevision: 3 }]));
    expect(await screen.findByText('已确认 1 条片段。')).toBeInTheDocument();
  });

  it('does not let the asset edit permission block writes in open access', async () => {
    vi.mocked(fetchContentAssetDetail).mockResolvedValue({
      asset: {
        assetId: ASSET, title: '整片-001', canEdit: false, rawSha256: 'a'.repeat(64), durationSeconds: 60, productName: '小紫瓶',
        productNames: ['小紫瓶'], externalOnly: false, rawObjectKey: 'raw.mp4', previewObjectKey: null, coverUrl: null,
      },
    } as never);
    vi.mocked(fetchStudioSegments).mockResolvedValue({ items: [segment(SUGGESTED, 'suggested', 5_000, 12_000)], nextCursor: null, assets: [] });
    renderWorkspace(`/content/ai-studio/segments?assetId=${ASSET}`, true, true);
    expect(await screen.findByRole('form', { name: '新建片段' })).toBeInTheDocument();
    expect(screen.queryByText('你没有这条原片的编辑权限，只能查看片段。')).not.toBeInTheDocument();
    cleanup();
    renderWorkspace(`/content/ai-studio/segments?assetId=${ASSET}`, true, false);
    expect(await screen.findByText('你没有这条原片的编辑权限，只能查看片段。')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: '新建片段' })).not.toBeInTheDocument();
  });

  it('renders a read-only view without write controls', async () => {
    vi.mocked(fetchStudioSegments).mockResolvedValue({ items: [segment(SUGGESTED, 'suggested', 5_000, 12_000)], nextCursor: null, assets: [] });
    renderWorkspace(`/content/ai-studio/segments?assetId=${ASSET}`, false);

    expect(await screen.findByText('你只有查看权限，不能新建或修改片段。')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: '新建片段' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /编\s*辑/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('segment library view', () => {
  it('ignores an unknown origin instead of sending it to the server', async () => {
    vi.mocked(fetchStudioSegments).mockResolvedValue({ items: [], nextCursor: null, assets: [] });
    renderWorkspace('/content/ai-studio/segments?origin=model');

    await waitFor(() => expect(fetchStudioSegments).toHaveBeenCalled());
    expect(vi.mocked(fetchStudioSegments).mock.calls[0][0].origin).toBeUndefined();
  });

  it('lists segments with URL filters and links each row to its annotation view', async () => {
    vi.mocked(fetchStudioSegments).mockResolvedValue({ items: [segment(SUGGESTED, 'suggested', 5_000, 12_000)], nextCursor: 'next', assets: [] });
    renderWorkspace('/content/ai-studio/segments?status=suggested&labelKey=street&origin=ai');

    expect(await screen.findByRole('heading', { name: '片段素材' })).toBeInTheDocument();
    await waitFor(() => expect(fetchStudioSegments).toHaveBeenCalled());
    expect(vi.mocked(fetchStudioSegments).mock.calls[0][0]).toMatchObject({ presetKey: 'framework', status: 'suggested', labelKey: 'street', origin: 'ai', limit: 50 });
    expect(screen.queryByText(/只作用于已加载/)).not.toBeInTheDocument();
    // Card view: the whole card opens the annotation view.
    expect(await screen.findByRole('button', { name: /^打开片段标注：/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /加载更多/ })).toBeInTheDocument();
  });

  it('keeps a per-row annotation link in the table view', async () => {
    vi.mocked(fetchStudioSegments).mockResolvedValue({ items: [segment(SUGGESTED, 'suggested', 5_000, 12_000)], nextCursor: null, assets: [] });
    renderWorkspace('/content/ai-studio/segments?view=table');

    const link = await screen.findByRole('link', { name: '去标注' });
    expect(link).toHaveAttribute('href', `/content/ai-studio/segments?assetId=${ASSET}&segmentId=${SUGGESTED}`);
  });
});
