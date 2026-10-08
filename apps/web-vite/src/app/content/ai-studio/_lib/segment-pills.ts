import type { AssetCardPill } from '@/app/marketing/content-assets/_components/content-assets-asset-intelligence';
import type { StudioContentSegment } from './ai-studio-api';
import { isSegmentReadOnly, segmentOriginLabel, segmentStatusView } from './segment-display';

export function hasSegmentProduct(segment: Pick<StudioContentSegment, 'productName'>): boolean {
  return Boolean(segment.productName?.trim());
}

/** Status, origin and remix blockers of one segment, in the 素材库 pill vocabulary. */
export function resolveSegmentPills(segment: StudioContentSegment): AssetCardPill[] {
  const readOnly = isSegmentReadOnly(segment);
  const status = segmentStatusView(readOnly ? 'stale' : segment.status);
  const pills: AssetCardPill[] = [
    {
      label: status.label,
      state: readOnly || segment.status === 'rejected' ? 'failed' : segment.status === 'confirmed' ? 'ready' : 'active',
    },
    { label: segmentOriginLabel(segment.origin), state: 'muted' },
  ];
  if (!hasSegmentProduct(segment) && !readOnly && segment.status !== 'rejected') {
    pills.push({ label: '缺产品，无法混剪', state: 'failed' });
  }
  return pills;
}
