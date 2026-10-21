import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  aiStudioQueryKeys,
  fetchAllStudioSegments,
  type StudioContentSegment,
  type StudioSegmentPreset,
} from '../_lib/ai-studio-api';
import { DEFAULT_PRESET_KEY, findPreset, labelName } from '../_lib/segment-display';
import type { SegmentKind } from '../_lib/segment-routes';

/**
 * Confirmed framework segments per asset, keeping only each asset's newest
 * framework version (the rule the selling-point worker and remix planning use).
 */
function framesByAsset(frames: readonly StudioContentSegment[]): Map<string, StudioContentSegment[]> {
  const newest = new Map<string, number>();
  for (const frame of frames) newest.set(frame.assetId, Math.max(newest.get(frame.assetId) ?? 0, frame.presetVersion));
  const byAsset = new Map<string, StudioContentSegment[]>();
  for (const frame of frames) {
    if (frame.presetVersion !== newest.get(frame.assetId)) continue;
    byAsset.set(frame.assetId, [...(byAsset.get(frame.assetId) ?? []), frame]);
  }
  return byAsset;
}

/** Framework segment a selling-point segment sits in: the one covering its midpoint. */
function containingFrame(byAsset: ReadonlyMap<string, readonly StudioContentSegment[]>, segment: StudioContentSegment) {
  const mid = (segment.startMs + segment.endMs) / 2;
  return byAsset.get(segment.assetId)?.find((frame) => frame.startMs <= mid && mid < frame.endMs);
}

/** 卖点片段 cards name the framework segment they sit in; framework libraries get no notes. */
export function useSellingPointFrameNotes(
  kind: SegmentKind,
  loaded: readonly StudioContentSegment[],
  presets: readonly StudioSegmentPreset[],
) {
  const framesQuery = useQuery({
    queryKey: [...aiStudioQueryKeys.segments(), 'selling-point-frames'],
    queryFn: ({ signal }) => fetchAllStudioSegments({ status: 'confirmed', presetKey: DEFAULT_PRESET_KEY }, { signal, maxPages: 5 }),
    enabled: kind === 'sellingPoint',
    staleTime: 60_000,
  });
  const notesById = useMemo(() => {
    const notes = new Map<string, string[]>();
    if (kind !== 'sellingPoint') return notes;
    const byAsset = framesByAsset((framesQuery.data?.items ?? []).filter((frame) => frame.sourceCurrent));
    for (const segment of loaded) {
      const frame = containingFrame(byAsset, segment);
      const list = frame ? [`${labelName(findPreset(presets, frame.presetKey, frame.presetVersion), frame.labelKey)}内`] : [];
      if (segment.continuesPrevious) list.push('连着上一段');
      notes.set(segment.segmentId, list);
    }
    return notes;
  }, [kind, framesQuery.data, loaded, presets]);
  const cardNotes = (segment: StudioContentSegment): string[] => notesById.get(segment.segmentId) ?? [];
  return { framesQuery, cardNotes };
}
