import type { ContentAssetItem } from './content-assets-types';

const LOW_QUALITY_TITLE_PATTERN = /^[A-Za-z0-9_-]{16,}$/;
const DEVICE_FILE_TITLE_PATTERN = /^(vid|img|dsc|mov|screenrecording|screen recording)[_-]?\d{4,}/i;
const DEFAULT_UNTITLED_TITLES = new Set(['', '未命名素材', '未命名视频']);
const GENERIC_METADATA_LABELS = new Set([
  '纯种草',
  '种草',
  '机制',
  '半机制',
  '混剪',
  '纯机制',
  '投流视频',
  '广告素材',
  '素材',
  '视频',
]);
const PROTECTED_USER_SOURCES = new Set(['manual', 'upload', 'file_name']);
const DETAIL_PRIMARY_USER_SOURCES = new Set(['manual', 'upload']);

export interface ContentAssetTagChip {
  label: string;
  source: 'asset' | 'ai' | 'system';
}

export interface ContentAssetDetailTitleView {
  primaryTitle: string;
  primaryTitleHint: string;
  sourceTitle: string | null;
  sourceHint: string | null;
  sourceContext: string | null;
}

export function isLowQualityContentAssetTitle(asset: ContentAssetItem): boolean {
  const title = (asset.title || '').trim();
  if (asset.titleSource === 'token_fallback') return true;
  if (DEFAULT_UNTITLED_TITLES.has(title)) return true;
  if (!PROTECTED_USER_SOURCES.has(asset.titleSource) && GENERIC_METADATA_LABELS.has(title)) return true;
  if (LOW_QUALITY_TITLE_PATTERN.test(title) && !/[\s\u4e00-\u9fff]/.test(title)) {
    return true;
  }
  if (DEVICE_FILE_TITLE_PATTERN.test(title)) return true;
  return title.includes('/') && title.length > 24;
}

export function resolveContentAssetDisplayTitle(asset: ContentAssetItem): string {
  if (!isLowQualityContentAssetTitle(asset)) return asset.title;
  const aiTitle = (asset.aiSuggestedTitle || '').trim();
  if (aiTitle) return aiTitle;
  if (asset.sourceSheetName && asset.sourceRowIndex) {
    return `${asset.sourceSheetName} 第${asset.sourceRowIndex}行视频`;
  }
  return '未命名视频';
}

export function resolveContentAssetProductText(asset: ContentAssetItem): string {
  const productNames = uniqueTags(asset.productNames);
  if (productNames.length > 0) return productNames.join(' / ');
  return (asset.productName || '').trim();
}

export function resolveContentAssetTitleHint(asset: ContentAssetItem): string {
  if (!isLowQualityContentAssetTitle(asset)) return sourceLabel(asset.titleSource);
  if (asset.aiSuggestedTitle) return 'AI 生成标题';
  return '来源行兜底标题';
}

export function resolveContentAssetDetailTitleView(asset: ContentAssetItem): ContentAssetDetailTitleView {
  const sourceTitle = (asset.title || '').trim();
  const aiTitle = (asset.aiSuggestedTitle || '').trim();
  const canPromoteAiTitle =
    aiTitle.length > 0 &&
    aiTitle !== sourceTitle &&
    !DETAIL_PRIMARY_USER_SOURCES.has(asset.titleSource);
  const primaryTitle = canPromoteAiTitle ? aiTitle : resolveContentAssetDisplayTitle(asset);

  return {
    primaryTitle,
    primaryTitleHint: canPromoteAiTitle ? 'AI 标题' : resolveContentAssetTitleHint(asset),
    sourceTitle: sourceTitle && sourceTitle !== primaryTitle ? sourceTitle : null,
    sourceHint: sourceTitle ? sourceLabel(asset.titleSource) : null,
    sourceContext: resolveContentAssetSourceContext(asset),
  };
}

export function resolveContentAssetTagChips(asset: ContentAssetItem, limit = 4): ContentAssetTagChip[] {
  const assetTags = uniqueTags(asset.tags);
  const aiTags = uniqueTags(asset.aiSuggestedTags);
  if (assetTags.length > 0 && !(isLowQualityContentAssetTags(asset, assetTags) && aiTags.length > 0)) {
    return assetTags.slice(0, limit).map((label) => ({ label, source: 'asset' }));
  }
  return aiTags.slice(0, limit).map((label) => ({ label, source: 'ai' }));
}

export function resolveContentAssetTagsText(asset: ContentAssetItem, limit = 4): string {
  const chips = resolveContentAssetTagChips(asset, limit);
  return chips.map((chip) => chip.label).join(' / ');
}

function uniqueTags(tags: string[] | null | undefined): string[] {
  const values: string[] = [];
  for (const tag of tags || []) {
    const normalized = tag.trim();
    if (normalized && !values.includes(normalized)) {
      values.push(normalized);
    }
  }
  return values;
}

function isLowQualityContentAssetTags(asset: ContentAssetItem, tags: string[]): boolean {
  if (PROTECTED_USER_SOURCES.has(asset.tagsSource)) return false;
  return tags.length > 0 && tags.every((tag) => GENERIC_METADATA_LABELS.has(tag));
}

function resolveContentAssetSourceContext(asset: ContentAssetItem): string | null {
  const parts: string[] = [];
  const sheetName = (asset.sourceSheetName || '').trim();
  if (sheetName) parts.push(sheetName);
  if (asset.sourceRowIndex != null) parts.push(`第${asset.sourceRowIndex}行`);
  return parts.length > 0 ? parts.join(' ') : null;
}

function sourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'manual':
      return '手工标题';
    case 'upload':
      return '上传标题';
    case 'feishu_row':
      return '飞书标题';
    case 'file_name':
      return '文件名标题';
    case 'ai_generated':
      return 'AI 生成标题';
    case 'row_fallback':
      return '来源行兜底标题';
    default:
      return '素材标题';
  }
}
