import type { DataOpsNotificationTraceReasonHashRecoveryItem } from '@/types/dataops';

import { MISSING_REASON_HASH_KEY } from './dataops-hub-formatters';

export type ChannelNameMap = Map<string, { channelName: string }>;

export function resolveChannelName(channelMap: ChannelNameMap, channelId: string): string {
  return channelMap.get(channelId)?.channelName || channelId;
}

export function formatReasonHashLabel(item: DataOpsNotificationTraceReasonHashRecoveryItem): string {
  return item.reasonHashKey === MISSING_REASON_HASH_KEY ? '缺失reasonHash' : item.reasonHashLabel;
}
