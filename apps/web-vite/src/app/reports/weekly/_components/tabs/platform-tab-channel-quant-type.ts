import { normalizeToken } from './platform-tab-formatters';
import type { ChannelQuantType } from './platform-tab-types';

export function resolveChannelQuantType(channelKey: string): ChannelQuantType {
  const normalizedChannel = normalizeToken(channelKey);
  if (normalizedChannel.includes('search') || normalizedChannel.includes('搜索')) {
    return 'search';
  }
  if (normalizedChannel.includes('recommend') || normalizedChannel.includes('推荐')) {
    return 'recommend';
  }
  if (
    normalizedChannel.includes('keywordad') ||
    normalizedChannel.includes('keyword') ||
    normalizedChannel.includes('关键词')
  ) {
    return 'keywordAd';
  }
  if (normalizedChannel.includes('crowdad') || normalizedChannel.includes('人群')) {
    return 'crowdAd';
  }
  if (normalizedChannel.includes('scenead') || normalizedChannel.includes('场景')) {
    return 'sceneAd';
  }
  return 'other';
}
