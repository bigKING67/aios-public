import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { fetchStructurePool, structurePoolToday } from './structure-pool-api';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));

afterEach(() => vi.clearAllMocks());

describe('structure pool API', () => {
  it('uses Beijing calendar dates around the UTC boundary', () => {
    expect(structurePoolToday(new Date('2026-10-29T16:30:00Z'))).toBe('2026-10-30');
  });

  it('requests the selected date through the shared API client', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { rows: [] } } as never);
    await fetchStructurePool('2026-10-30');
    expect(apiClient.get).toHaveBeenCalledWith('/marketing/content-assets/studio/structure-pool', {
      params: { date: '2026-10-30' },
      signal: undefined,
    });
  });
});
