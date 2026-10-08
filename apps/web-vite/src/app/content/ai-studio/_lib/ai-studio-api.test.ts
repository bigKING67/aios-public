import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  buildStudioSegmentParams,
  confirmStudioSegments,
  createStudioSegment,
  fetchAllStudioSegments,
  fetchStudioSegments,
  updateStudioSegment,
} from './ai-studio-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const segment = (id: string) => ({ segmentId: id });

afterEach(() => vi.clearAllMocks());

describe('AI studio API client', () => {
  it('drops empty filters from list params', () => {
    expect(buildStudioSegmentParams({ assetId: ' a ', labelKey: '', productName: undefined, limit: 50 })).toEqual({ assetId: 'a', limit: 50 });
  });

  it('sends the origin filter to the list endpoint', async () => {
    expect(buildStudioSegmentParams({ origin: 'ai', status: 'suggested' })).toEqual({ origin: 'ai', status: 'suggested' });
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [], nextCursor: null } } as never);
    await fetchStudioSegments({ presetKey: 'framework', origin: 'human', limit: 50 });
    expect(apiClient.get).toHaveBeenCalledWith('/marketing/content-assets/studio/segments', {
      params: { presetKey: 'framework', origin: 'human', limit: 50 },
      signal: undefined,
    });
  });

  it('posts batch confirm to the literal colon path without retries', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { items: [segment('s1')] } } as never);
    await confirmStudioSegments([{ segmentId: 's1', expectedRevision: 2 }]);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/marketing/content-assets/studio/segments:confirm',
      { items: [{ segmentId: 's1', expectedRevision: 2 }] },
      { retryAttempts: 0 },
    );
  });

  it('encodes the segment id and never retries writes', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: segment('a/b') } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: segment('n') } as never);
    await updateStudioSegment('a/b', { expectedRevision: 1, status: 'rejected' });
    await createStudioSegment({ assetId: 'x', presetKey: 'framework', presetVersion: 1, labelKey: 'street', startMs: 0, endMs: 1000 });
    expect(apiClient.patch).toHaveBeenCalledWith('/marketing/content-assets/studio/segments/a%2Fb', { expectedRevision: 1, status: 'rejected' }, { retryAttempts: 0 });
    expect(vi.mocked(apiClient.post).mock.calls[0][2]).toEqual({ retryAttempts: 0 });
  });

  it('walks cursors and reports truncation at the page cap', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { items: [segment('1')], nextCursor: '1' } } as never)
      .mockResolvedValueOnce({ data: { items: [segment('2')], nextCursor: null } } as never);
    await expect(fetchAllStudioSegments({ assetId: 'a' })).resolves.toEqual({ items: [segment('1'), segment('2')], truncated: false });
    expect(vi.mocked(apiClient.get).mock.calls[1][1]).toMatchObject({ params: { assetId: 'a', cursor: '1', limit: 200 } });

    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [segment('x')], nextCursor: 'x' } } as never);
    await expect(fetchAllStudioSegments({ assetId: 'a' }, { maxPages: 2 })).resolves.toMatchObject({ truncated: true });
  });
});
