import type { AssetCardPill } from '@/app/marketing/content-assets/_components/content-assets-asset-intelligence';
import type { ContentAssetSegmentStatusFilter } from '@/app/marketing/content-assets/_lib/content-assets-types';
import type { StudioAssetSegmentSummary } from './ai-studio-api';

export const ASSET_ANNOTATION_OPTIONS: { value: '' | ContentAssetSegmentStatusFilter; label: string }[] = [
  { value: '', label: '全部标注状态' },
  { value: 'unlabeled', label: '未标注' },
  { value: 'suggested', label: '有待确认建议' },
  { value: 'confirmed', label: '已有确认片段' },
];

export function readAnnotationFilter(value: string | null): ContentAssetSegmentStatusFilter | undefined {
  return ASSET_ANNOTATION_OPTIONS.some((option) => option.value && option.value === value)
    ? (value as ContentAssetSegmentStatusFilter)
    : undefined;
}

/**
 * Card pills for one whole video. `summary` is undefined while counts load, so
 * the card never claims "未标注" before the server has answered.
 */
export function resolveAnnotationPills(
  summary: StudioAssetSegmentSummary | undefined,
  hasProduct: boolean
): AssetCardPill[] {
  const pills: AssetCardPill[] = [];
  if (!summary) {
    pills.push({ label: '标注读取中', state: 'muted' });
  } else {
    if (summary.suggestionActive) pills.push({ label: 'AI 分析中', state: 'active' });
    if (summary.suggestedCount > 0) pills.push({ label: `待确认 ${summary.suggestedCount}`, state: 'active' });
    if (summary.confirmedCount > 0) pills.push({ label: `已确认 ${summary.confirmedCount} 段`, state: 'ready' });
    if (pills.length === 0) pills.push({ label: '未标注', state: 'muted' });
  }
  // Remix pairs segments by their own product; an original without one only
  // matters until its confirmed segments carry a product.
  if (!hasProduct && !(summary && summary.confirmedCount > 0)) pills.push({ label: '未绑定产品', state: 'muted' });
  return pills;
}
