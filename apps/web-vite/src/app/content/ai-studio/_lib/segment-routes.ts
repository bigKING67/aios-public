import { ROUTE_PATHS } from '@/lib/route-policy-registry';

/** Annotation view of one source asset; `segmentId` focuses a row. */
export function buildSegmentAnnotationPath(assetId: string, segmentId?: string): string {
  const params = new URLSearchParams({ assetId });
  if (segmentId) params.set('segmentId', segmentId);
  return `${ROUTE_PATHS.contentAiStudioSegments}?${params.toString()}`;
}
