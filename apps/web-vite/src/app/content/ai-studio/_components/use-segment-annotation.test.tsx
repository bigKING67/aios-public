import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchContentAssetDetail } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { apiClient } from '@/lib/api-client';
import { queryClient as appQueryClient } from '@/lib/react-query';
import { APIError } from '@/lib/request';
import type { StudioContentSegment, StudioSegmentPreset } from '../_lib/ai-studio-api';
import { useSegmentAnnotation } from './use-segment-annotation';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock('@/app/marketing/content-assets/_lib/content-assets-api', () => ({
  fetchContentAssetDetail: vi.fn(),
}));

const ASSET = '9f9f9f9f-0000-4000-8000-000000000001';
const CONFLICT = '11111111-1111-4111-8111-111111111111';
const PRESET: StudioSegmentPreset = {
  presetKey: 'framework',
  version: 1,
  dimension: 'framework',
  name: '框架',
  status: 'active',
  labels: [{ key: 'street', name: '街采', definition: '' }],
};

function renderAnnotation() {
  // The app client retries mutations once by default; the hook must opt out.
  const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useSegmentAnnotation(ASSET, PRESET, [PRESET]), { wrapper });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useSegmentAnnotation writes', () => {
  it('surfaces a 409 immediately without retrying the non-idempotent create', async () => {
    vi.mocked(fetchContentAssetDetail).mockResolvedValue({ asset: { assetId: ASSET, rawSha256: 'a'.repeat(64) } } as never);
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [], nextCursor: null } } as never);
    vi.mocked(apiClient.post).mockRejectedValue(new APIError('CONFLICT', 409, `与已确认片段时间重叠：${CONFLICT}`));
    const { result } = renderAnnotation();
    await waitFor(() => expect(result.current.assetQuery.isSuccess).toBe(true));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.createSegment({ startMs: 0, endMs: 1000, labelKey: 'street', draft: false });
    });

    expect(saved).toBe(false);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
    expect(result.current.notice).toMatchObject({ tone: 'error', error: { kind: 'overlap', segmentIds: [CONFLICT] } });
  });

  it('does not retry a conflicting update', async () => {
    vi.mocked(fetchContentAssetDetail).mockResolvedValue({ asset: { assetId: ASSET, rawSha256: null } } as never);
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [], nextCursor: null } } as never);
    vi.mocked(apiClient.patch).mockRejectedValue(new APIError('CONFLICT', 409, '片段已被修改，请刷新后重试'));
    const { result } = renderAnnotation();
    await waitFor(() => expect(result.current.assetQuery.isSuccess).toBe(true));

    await act(async () => {
      await result.current.updateSegment({ segmentId: CONFLICT, revision: 2 } as StudioContentSegment, { expectedRevision: 2, status: 'confirmed' });
    });

    expect(apiClient.patch).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toMatchObject({ tone: 'error', error: { kind: 'revision' } });
  });

  it('reloads the asset after a source_changed conflict so the next create sends the new hash', async () => {
    vi.mocked(fetchContentAssetDetail).mockResolvedValue({ asset: { assetId: ASSET, rawSha256: 'a'.repeat(64) } } as never);
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [], nextCursor: null } } as never);
    vi.mocked(apiClient.post).mockRejectedValue(new APIError('CONFLICT', 409, '原片已变化，请刷新后重新标注'));
    const { result } = renderAnnotation();
    await waitFor(() => expect(result.current.assetQuery.isSuccess).toBe(true));
    expect(fetchContentAssetDetail).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.createSegment({ startMs: 0, endMs: 1000, labelKey: 'street', draft: false });
    });

    expect(result.current.notice).toMatchObject({ tone: 'error', error: { kind: 'stale' } });
    await waitFor(() => expect(fetchContentAssetDetail).toHaveBeenCalledTimes(2));
  });
});
