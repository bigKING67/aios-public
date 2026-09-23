import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import type {
  DataOpsNotificationTraceReasonHashRecoveryItem,
  DataOpsNotificationTraceSummary,
} from '@/types/dataops';
import {
  buildNotificationTraceGroupKey,
  MISSING_REASON_HASH_KEY,
  normalizeToken,
  toTimestamp,
} from './dataops-hub-formatters';
import { normalizeNotificationFailureReason } from './dataops-notification-failure-helpers';
import type {
  ChannelNameMap,
  NotificationTraceReasonHashRecoverySummary,
} from './dataops-notification-retry-types';

export function buildNotificationTraceReasonHashRecovery(
  events: DataOpsNotificationEvent[]
): DataOpsNotificationTraceReasonHashRecoveryItem[] {
  if (!events.length) {
    return [];
  }

  const orderedEvents = events
    .slice()
    .sort((left, right) => {
      const diff = toTimestamp(left.sentAt) - toTimestamp(right.sentAt);
      if (diff !== 0) {
        return diff;
      }
      return left.id.localeCompare(right.id, 'zh-CN');
    });
  const traceGroupEventMap = new Map<string, DataOpsNotificationEvent[]>();

  for (const event of orderedEvents) {
    const traceGroupKey = buildNotificationTraceGroupKey(event);
    const existed = traceGroupEventMap.get(traceGroupKey);
    if (!existed) {
      traceGroupEventMap.set(traceGroupKey, [event]);
      continue;
    }
    existed.push(event);
  }

  const reasonHashMap = new Map<
    string,
    {
      reasonHashKey: string;
      reasonHashLabel: string;
      firstFailedCount: number;
      recoveredCount: number;
      unresolvedCount: number;
      sampleReasons: Set<string>;
      traceGroupKeySet: Set<string>;
    }
  >();

  for (const [traceGroupKey, traceEvents] of traceGroupEventMap.entries()) {
    const firstFailedIndex = traceEvents.findIndex((item) => item.status === 'failed');
    if (firstFailedIndex < 0) {
      continue;
    }

    const firstFailedEvent = traceEvents[firstFailedIndex];
    const normalizedReasonHash = normalizeToken(firstFailedEvent.reasonHash || '');
    const reasonHashKey = normalizedReasonHash || MISSING_REASON_HASH_KEY;
    const reasonHashLabel = normalizedReasonHash
      ? (firstFailedEvent.reasonHash || '').trim() || normalizedReasonHash
      : '缺失';
    const hasSuccessAfterFirstFailure = traceEvents
      .slice(firstFailedIndex + 1)
      .some((item) => item.status === 'sent');
    const normalizedFailureReason = normalizeNotificationFailureReason(firstFailedEvent.detail);
    const current = reasonHashMap.get(reasonHashKey);
    if (!current) {
      reasonHashMap.set(reasonHashKey, {
        reasonHashKey,
        reasonHashLabel,
        firstFailedCount: 1,
        recoveredCount: hasSuccessAfterFirstFailure ? 1 : 0,
        unresolvedCount: hasSuccessAfterFirstFailure ? 0 : 1,
        sampleReasons: new Set([normalizedFailureReason]),
        traceGroupKeySet: new Set([traceGroupKey]),
      });
      continue;
    }

    current.firstFailedCount += 1;
    if (hasSuccessAfterFirstFailure) {
      current.recoveredCount += 1;
    } else {
      current.unresolvedCount += 1;
    }
    current.sampleReasons.add(normalizedFailureReason);
    current.traceGroupKeySet.add(traceGroupKey);
  }

  return Array.from(reasonHashMap.values())
    .map((item) => {
      const sampleReason = Array.from(item.sampleReasons).filter(Boolean).slice(0, 2).join(' / ');
      const recoveryRate = item.firstFailedCount
        ? Math.round((item.recoveredCount / item.firstFailedCount) * 100)
        : 0;
      return {
        reasonHashKey: item.reasonHashKey,
        reasonHashLabel: item.reasonHashLabel,
        firstFailedCount: item.firstFailedCount,
        recoveredCount: item.recoveredCount,
        unresolvedCount: item.unresolvedCount,
        recoveryRate,
        sampleReason,
        traceGroupKeys: Array.from(item.traceGroupKeySet),
      };
    })
    .sort((left, right) => {
      if (right.firstFailedCount !== left.firstFailedCount) {
        return right.firstFailedCount - left.firstFailedCount;
      }
      if (right.recoveryRate !== left.recoveryRate) {
        return right.recoveryRate - left.recoveryRate;
      }
      return left.reasonHashLabel.localeCompare(right.reasonHashLabel, 'zh-CN');
    });
}

export function buildNotificationTraceReasonHashRecoverySummary(
  items: DataOpsNotificationTraceReasonHashRecoveryItem[]
): NotificationTraceReasonHashRecoverySummary | null {
  if (!items.length) {
    return null;
  }

  const firstFailedCount = items.reduce((sum, item) => sum + item.firstFailedCount, 0);
  const recoveredCount = items.reduce((sum, item) => sum + item.recoveredCount, 0);
  const unresolvedCount = items.reduce((sum, item) => sum + item.unresolvedCount, 0);
  const recoveryRate = firstFailedCount ? Math.round((recoveredCount / firstFailedCount) * 100) : 0;

  return {
    firstFailedCount,
    recoveredCount,
    unresolvedCount,
    recoveryRate,
  };
}

export function buildNotificationTraceSummary(
  events: DataOpsNotificationEvent[],
  options: {
    availableChannelIds: ReadonlySet<string>;
    channelMap: ChannelNameMap;
  }
): DataOpsNotificationTraceSummary | null {
  if (!events.length) {
    return null;
  }

  const sentCount = events.filter((item) => item.status === 'sent').length;
  const failedCount = events.filter((item) => item.status === 'failed').length;
  const skippedCount = events.filter((item) => item.status === 'skipped').length;
  const retryableFailedCount = events.filter(
    (item) => item.status === 'failed' && options.availableChannelIds.has(item.channelId)
  ).length;
  const channelIds = Array.from(new Set(events.map((item) => item.channelId)));
  const channelNames = channelIds.map(
    (channelId) => options.channelMap.get(channelId)?.channelName || channelId
  );

  return {
    totalCount: events.length,
    sentCount,
    failedCount,
    skippedCount,
    retryableFailedCount,
    earliestAt: events[events.length - 1]?.sentAt || '',
    latestAt: events[0]?.sentAt || '',
    channelNames,
  };
}
