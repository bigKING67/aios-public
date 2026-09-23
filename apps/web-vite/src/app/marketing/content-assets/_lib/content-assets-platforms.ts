export const CONTENT_ASSET_PLATFORM_OPTIONS = [
  { label: '抖音', value: 'douyin' },
  { label: '快手', value: 'kuaishou' },
  { label: '淘宝', value: 'taobao' },
  { label: '小红书', value: 'xhs' },
  { label: '未确认', value: 'other' },
] as const;

const PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音',
  taobao: '淘宝',
  tmall: '淘宝',
  qianchuan: '千川',
  xhs: '小红书',
  kuaishou: '快手',
  wechat_channels: '视频号',
  other: '未确认',
  ocean_engine: '巨量引擎',
  xhs_juguang: '小红书聚光',
  抖音: '抖音',
  淘宝: '淘宝',
  天猫: '淘宝',
  千川: '千川',
  小红书: '小红书',
  快手: '快手',
  视频号: '视频号',
  未确认: '未确认',
};

export function contentAssetPlatformLabel(value?: string | null): string {
  if (!value) return '--';
  return PLATFORM_LABELS[value] || value;
}

export function contentAssetPlatformNamesLabel(
  platformNames?: string[] | null,
  fallbackPlatform?: string | null
): string {
  const values = normalizePlatformValues(platformNames?.length ? platformNames : fallbackPlatform ? [fallbackPlatform] : []);
  if (!values.length) return '--';
  return values.map(contentAssetPlatformLabel).join(' / ');
}

export function toContentAssetPlatformOption(value: string) {
  return {
    label: contentAssetPlatformLabel(value),
    value,
  };
}

function normalizePlatformValues(values: readonly string[]): string[] {
  const normalized: string[] = [];
  for (const value of values) {
    const item = String(value || '').trim();
    if (!item) continue;
    if (normalized.some((existing) => existing.toLowerCase() === item.toLowerCase())) continue;
    normalized.push(item);
  }
  return normalized;
}
