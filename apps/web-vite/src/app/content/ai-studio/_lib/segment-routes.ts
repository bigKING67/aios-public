import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { SELLING_POINT_PRESET_KEY } from './segment-display';

/** The two segment libraries: 框架片段 and 卖点片段. */
export type SegmentKind = 'framework' | 'sellingPoint';

export function segmentListPath(kind: SegmentKind): string {
  return kind === 'sellingPoint' ? ROUTE_PATHS.contentAiStudioSellingPoints : ROUTE_PATHS.contentAiStudioSegments;
}

/**
 * Annotation view of one source asset; `segmentId` focuses a row and
 * `presetKey` selects the preset. Selling-point presets open under 卖点片段.
 */
export function buildSegmentAnnotationPath(assetId: string, segmentId?: string, presetKey?: string): string {
  const params = new URLSearchParams({ assetId });
  if (segmentId) params.set('segmentId', segmentId);
  if (presetKey) params.set('presetKey', presetKey);
  const sellingPoint = presetKey === SELLING_POINT_PRESET_KEY;
  return `${segmentListPath(sellingPoint ? 'sellingPoint' : 'framework')}?${params.toString()}`;
}
