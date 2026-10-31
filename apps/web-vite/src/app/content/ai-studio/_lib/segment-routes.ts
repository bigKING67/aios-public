import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { SELLING_POINT_PRESET_KEY } from './segment-display';

/** The two segment libraries: 框架片段 and 卖点片段. */
export type SegmentKind = 'framework' | 'sellingPoint';

export function segmentListPath(kind: SegmentKind): string {
  return kind === 'sellingPoint' ? ROUTE_PATHS.contentAiStudioSellingPoints : ROUTE_PATHS.contentAiStudioSegments;
}

/** Where an annotation was opened from, so its back link and breadcrumb lead there. */
export type AnnotationSource = 'assets' | 'analysis';
export const ANNOTATION_FROM_PARAM = 'from';

export function readAnnotationSource(params: URLSearchParams): AnnotationSource | null {
  const value = params.get(ANNOTATION_FROM_PARAM);
  return value === 'assets' || value === 'analysis' ? value : null;
}

/**
 * Annotation view of one source asset; `segmentId` focuses a row and
 * `presetKey` selects the preset. Selling-point presets open under 卖点片段.
 * `from` marks an entry from 原片 or AI 切段 (absent: the segment library).
 */
export function buildSegmentAnnotationPath(assetId: string, segmentId?: string, presetKey?: string, from?: AnnotationSource): string {
  const params = new URLSearchParams({ assetId });
  if (segmentId) params.set('segmentId', segmentId);
  if (presetKey) params.set('presetKey', presetKey);
  if (from) params.set(ANNOTATION_FROM_PARAM, from);
  const sellingPoint = presetKey === SELLING_POINT_PRESET_KEY;
  return `${segmentListPath(sellingPoint ? 'sellingPoint' : 'framework')}?${params.toString()}`;
}
