const PLATFORM_ALIAS_GROUPS = [
  ['tmall', 'taobao', '天猫', '淘系'],
  ['douyin', '抖音'],
  ['xiaohongshu', 'xhs', '小红书'],
  ['wechat', 'weixin', 'wx', '微信'],
  ['jd', 'jingdong', '京东'],
];

const TRAFFIC_CHANNEL_LABELS: Record<string, string> = {
  search: '搜索',
  recommend: '推荐',
  keyword_ad: '关键词推广',
  keywordad: '关键词推广',
  crowd_ad: '人群推广',
  crowdad: '人群推广',
  scene_ad: '场景推广',
  scenead: '场景推广',
  搜索: '搜索',
  推荐: '推荐',
  关键词推广: '关键词推广',
  人群推广: '人群推广',
  场景推广: '场景推广',
};

export function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, '');
}

export function resolvePlatformAliases(platform: string): string[] {
  const normalizedPlatform = normalizeToken(platform);
  const matchedGroup = PLATFORM_ALIAS_GROUPS.find((group) =>
    group.some((item) => normalizeToken(item) === normalizedPlatform)
  );

  if (!matchedGroup) {
    return [normalizedPlatform];
  }

  return Array.from(new Set(matchedGroup.map((item) => normalizeToken(item))));
}

export function resolvePlatformLabel(platform: string): string {
  const normalizedPlatform = normalizeToken(platform);
  const match = PLATFORM_ALIAS_GROUPS.find((group) =>
    group.some((item) => normalizeToken(item) === normalizedPlatform)
  );
  if (!match) {
    return platform;
  }

  const preferredLabel = match.find((item) => /[\u4e00-\u9fa5]/.test(item));
  return preferredLabel || platform;
}

export function resolveTrafficChannelLabel(channel: string): string {
  const normalizedChannel = normalizeToken(channel);
  if (TRAFFIC_CHANNEL_LABELS[normalizedChannel]) {
    return TRAFFIC_CHANNEL_LABELS[normalizedChannel];
  }
  return channel || '未知渠道';
}
