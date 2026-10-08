import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { aiStudioQueryKeys, fetchStudioAssetSegmentSummaries, type StudioAssetSegmentSummary } from '../_lib/ai-studio-api';

/** Annotation counts for the assets currently on screen (≤100 ids per call), optionally for one preset. */
export function useAssetAnnotationSummaries(assetIds: readonly string[], presetKey?: string) {
  const query = useQuery({
    queryKey: aiStudioQueryKeys.assetSummaries(assetIds, presetKey),
    queryFn: ({ signal }) => fetchStudioAssetSegmentSummaries(assetIds, { signal, presetKey }),
    enabled: assetIds.length > 0,
  });
  const summaries = useMemo(
    () => new Map<string, StudioAssetSegmentSummary>((query.data ?? []).map((summary) => [summary.assetId, summary])),
    [query.data]
  );
  return { summaries, query };
}
