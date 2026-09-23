import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import { getNotificationEventTypeLabel } from './dataops-hub-formatters';
import type { DataOpsCsvCell } from './dataops-export-helpers';
import type { ChannelNameMap, NotificationRetryReport } from './dataops-notification-retry-types';

export function buildNotificationEventsCsvRows(
  events: DataOpsNotificationEvent[],
  channelMap: ChannelNameMap
): DataOpsCsvCell[][] {
  return events.map((item) => {
    const channelName = channelMap.get(item.channelId)?.channelName || item.channelId;

    return [
      item.sentAt,
      item.channelId,
      channelName,
      item.eventType,
      getNotificationEventTypeLabel(item.eventType),
      item.title,
      item.targetTable,
      item.flowName,
      item.status,
      item.level,
      item.reasonHash || '',
      item.retryGroupId || '',
      item.detail,
    ];
  });
}

export function buildNotificationRetryReportCsvRows(
  report: NotificationRetryReport
): DataOpsCsvCell[][] {
  return report.items.map((item) => [
    report.executedAt,
    report.concurrency,
    item.status,
    item.eventId,
    item.title,
    item.channelId,
    item.channelName,
    item.message,
  ]);
}

export function buildNotificationRetryGroupTraceCsvRows(
  events: DataOpsNotificationEvent[],
  channelMap: ChannelNameMap
): DataOpsCsvCell[][] {
  return events.map((item) => {
    const channelName = channelMap.get(item.channelId)?.channelName || item.channelId;

    return [
      item.sentAt,
      item.id,
      item.channelId,
      channelName,
      item.eventType,
      getNotificationEventTypeLabel(item.eventType),
      item.status,
      item.level,
      item.title,
      item.reasonHash || '',
      item.retryGroupId || '',
      item.detail,
    ];
  });
}
