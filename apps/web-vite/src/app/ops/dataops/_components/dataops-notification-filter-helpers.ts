import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import {
  buildNotificationTraceGroupKey,
  matchesKeyword,
  normalizeToken,
  toTimestamp,
  type NotificationTraceFilter,
} from './dataops-hub-formatters';
import { normalizeNotificationFailureReason } from './dataops-notification-failure-helpers';
import type { NotificationEventFilterOptions } from './dataops-notification-retry-types';

export function filterNotificationEvents(
  events: DataOpsNotificationEvent[],
  filters: NotificationEventFilterOptions
): DataOpsNotificationEvent[] {
  return events.filter((item) => {
    if (filters.channelFilter !== 'all' && item.channelId !== filters.channelFilter) {
      return false;
    }
    if (filters.eventTypeFilter !== 'all' && item.eventType !== filters.eventTypeFilter) {
      return false;
    }
    if (filters.statusFilter !== 'all' && item.status !== filters.statusFilter) {
      return false;
    }
    if (filters.normalizedReasonHashFilter) {
      const reasonHash = normalizeToken(item.reasonHash || '');
      if (!reasonHash || !reasonHash.startsWith(filters.normalizedReasonHashFilter)) {
        return false;
      }
    }
    if (filters.normalizedRetryGroupIdFilter) {
      const retryGroupId = normalizeToken(item.retryGroupId || '');
      if (!retryGroupId || !retryGroupId.includes(filters.normalizedRetryGroupIdFilter)) {
        return false;
      }
    }
    if (filters.selectedFailureReason) {
      if (item.status !== 'failed') {
        return false;
      }
      if (normalizeNotificationFailureReason(item.detail) !== filters.selectedFailureReason) {
        return false;
      }
    }

    const targetText = [
      item.title,
      item.targetTable,
      item.flowName,
      item.eventType,
      item.detail,
      item.reasonHash || '',
      item.retryGroupId || '',
    ].join(' ');

    return matchesKeyword(filters.normalizedKeyword, targetText);
  });
}

export function filterNotificationTraceEventsByRetryGroup(
  events: DataOpsNotificationEvent[],
  retryGroupId: string
): DataOpsNotificationEvent[] {
  const targetRetryGroupId = normalizeToken(retryGroupId);
  if (!targetRetryGroupId) {
    return [];
  }

  return events
    .filter((item) => normalizeToken(item.retryGroupId || '') === targetRetryGroupId)
    .slice()
    .sort((left, right) => {
      const diff = toTimestamp(right.sentAt) - toTimestamp(left.sentAt);
      if (diff !== 0) {
        return diff;
      }
      return right.id.localeCompare(left.id, 'zh-CN');
    });
}

export function filterNotificationTraceEvents(options: {
  events: DataOpsNotificationEvent[];
  failedEvents: DataOpsNotificationEvent[];
  retryableFailedEvents: DataOpsNotificationEvent[];
  traceFilter: NotificationTraceFilter;
  focusGroupSet: ReadonlySet<string> | null;
}): DataOpsNotificationEvent[] {
  let targetEvents = options.events;
  if (options.traceFilter === 'failed') {
    targetEvents = options.failedEvents;
  } else if (options.traceFilter === 'retryable_failed') {
    targetEvents = options.retryableFailedEvents;
  }

  const focusGroupSet = options.focusGroupSet;
  if (!focusGroupSet) {
    return targetEvents;
  }

  return targetEvents.filter((item) => focusGroupSet.has(buildNotificationTraceGroupKey(item)));
}
