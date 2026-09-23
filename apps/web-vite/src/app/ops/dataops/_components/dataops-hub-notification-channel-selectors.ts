import type {
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
} from '@/config/dataops-hub';
import {
  getNotificationChannelPriority,
  getNotificationEventTypeLabel,
  getStatusPriority,
  toTimestamp,
} from './dataops-hub-formatters';
import type {
  DataOpsNotificationChannelSummary,
} from './dataops-hub-selector-types';

export function sortDataOpsNotificationChannels(
  notificationChannels: DataOpsNotificationChannel[]
): DataOpsNotificationChannel[] {
  return notificationChannels.slice().sort((left, right) => {
    const priorityDiff =
      getNotificationChannelPriority(left.id) - getNotificationChannelPriority(right.id);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const statusDiff = getStatusPriority(left.status) - getStatusPriority(right.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    if (right.failureCount24h !== left.failureCount24h) {
      return right.failureCount24h - left.failureCount24h;
    }

    const deliveredDiff = toTimestamp(right.lastDeliveredAt) - toTimestamp(left.lastDeliveredAt);
    if (deliveredDiff !== 0) {
      return deliveredDiff;
    }

    return left.channelName.localeCompare(right.channelName, 'zh-CN');
  });
}

export function buildDataOpsNotificationChannelSummary(
  orderedNotificationChannels: DataOpsNotificationChannel[]
): DataOpsNotificationChannelSummary {
  const totalCount = orderedNotificationChannels.length;
  const activeCount = orderedNotificationChannels.filter(
    (channel) => channel.enabled && channel.status !== 'paused'
  ).length;
  const pausedCount = orderedNotificationChannels.filter(
    (channel) => !channel.enabled || channel.status === 'paused'
  ).length;
  const riskCount = orderedNotificationChannels.filter(
    (channel) => channel.status === 'warning' || channel.status === 'error'
  ).length;
  const failureCount24h = orderedNotificationChannels.reduce(
    (sum, channel) => sum + channel.failureCount24h,
    0
  );

  return {
    totalCount,
    activeCount,
    pausedCount,
    riskCount,
    failureCount24h,
  };
}

export function buildNotificationEventTypeOptions({
  notificationEvents,
  currentFilter,
}: {
  notificationEvents: DataOpsNotificationEvent[];
  currentFilter: string;
}): Array<{ label: string; value: string }> {
  const eventTypes = Array.from(new Set(notificationEvents.map((item) => item.eventType))).sort(
    (left, right) => left.localeCompare(right, 'zh-CN')
  );
  if (currentFilter !== 'all' && currentFilter.trim() && !eventTypes.includes(currentFilter)) {
    eventTypes.unshift(currentFilter);
  }

  return [
    { label: '全部事件', value: 'all' },
    ...eventTypes.map((eventType) => ({
      label: getNotificationEventTypeLabel(eventType),
      value: eventType,
    })),
  ];
}
