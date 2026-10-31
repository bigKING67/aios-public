import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type StudioStructurePoolResponse,
  type StudioStructurePoolRow,
} from '@/lib/generated-api-contract';

export type { StudioStructurePoolResponse, StudioStructurePoolRow };

const BEIJING_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' });

export const STRUCTURE_POOL_PRODUCT = '百雀羚香粉';

/** The daily pool is requested for Beijing's current calendar date. */
export function structurePoolToday(now = new Date()): string {
  return BEIJING_DATE.format(now);
}

export const structurePoolQueryKey = (date: string) => ['content-ai-studio', 'structure-pool', date] as const;

export async function fetchStructurePool(date: string, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioStructurePoolResponse>(AIOS_API_PATHS.contentStudioStructurePool, {
      params: { date },
      signal: options?.signal,
    })
  ).data;
}
