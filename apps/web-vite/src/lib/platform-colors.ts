export const PLATFORM_LEGEND_COLORS = {
  tmall: '#EC5E2A',
  douyin: '#000000',
  xiaohongshu: '#FF2442',
  kuaishou: '#FF3C21',
  jd: '#DA291C',
  wechat: '#07C160',
  unknown: '#8A8F8A',
} as const;

export type PlatformLegendColorKey = keyof typeof PLATFORM_LEGEND_COLORS;

const PLATFORM_LEGEND_ALIAS_TO_KEY: Record<string, PlatformLegendColorKey> = {
  tmall: 'tmall',
  taobao: 'tmall',
  tao: 'tmall',
  '天猫': 'tmall',
  '淘宝': 'tmall',
  '淘系': 'tmall',

  douyin: 'douyin',
  dy: 'douyin',
  '抖音': 'douyin',

  xhs: 'xiaohongshu',
  xiaohongshu: 'xiaohongshu',
  redbook: 'xiaohongshu',
  '小红书': 'xiaohongshu',

  kuaishou: 'kuaishou',
  ks: 'kuaishou',
  '快手': 'kuaishou',

  jd: 'jd',
  jingdong: 'jd',
  '京东': 'jd',

  wx: 'wechat',
  wechat: 'wechat',
  weixin: 'wechat',
  miniprogram: 'wechat',
  '微信': 'wechat',
  '微信小程序': 'wechat',

  unknown: 'unknown',
  unclassified: 'unknown',
  '未归属': 'unknown',
  '未知': 'unknown',
  '其他': 'unknown',
};

export function normalizePlatformLegendName(platform: string | null | undefined): string {
  return String(platform || '').trim().toLowerCase().replace(/[\s_-]/g, '');
}

export function resolvePlatformLegendKey(
  platform: string | null | undefined
): PlatformLegendColorKey | undefined {
  const normalized = normalizePlatformLegendName(platform);
  if (!normalized) {
    return undefined;
  }
  return PLATFORM_LEGEND_ALIAS_TO_KEY[normalized];
}

export function resolvePlatformLegendColor(
  platform: string | null | undefined,
  fallback?: string
): string | undefined {
  const key = resolvePlatformLegendKey(platform);
  return key ? PLATFORM_LEGEND_COLORS[key] : fallback;
}

export function getPlatformLegendColor(
  platform: string | null | undefined,
  fallback: string = PLATFORM_LEGEND_COLORS.unknown
): string {
  return resolvePlatformLegendColor(platform, fallback) || fallback;
}
