import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import { formatDateTime, getNotificationEventTypeLabel } from './dataops-hub-formatters';
import type {
  NotificationFailureReasonSummaryItem,
  NotificationFailureStats,
} from './dataops-notification-retry-types';

export function buildNotificationRetryDraft(
  event: DataOpsNotificationEvent,
  nowText: string
): {
  title: string;
  text: string;
} {
  const retryTitle = event.title.startsWith('[重发]') ? event.title : `[重发] ${event.title}`;
  const retryBody = [
    `时间：${nowText}`,
    `重发来源：${formatDateTime(event.sentAt)}`,
    `事件类型：${getNotificationEventTypeLabel(event.eventType)}`,
    `目标表：${event.targetTable}`,
    `Flow：${event.flowName}`,
    `上次状态：${event.status}`,
    `原始明细：${event.detail}`,
  ].join('\n');

  return {
    title: retryTitle,
    text: retryBody,
  };
}

export function normalizeNotificationFailureReason(detail: string): string {
  const normalized = detail.trim();
  if (!normalized) {
    return '未知失败原因';
  }

  const cleaned = normalized
    .replace(/^Webhook\s*(?:手动通知)?发送失败[:：]\s*/i, '')
    .replace(/^Webhook\s*测试失败[:：]\s*/i, '')
    .replace(/^飞书返回错误\(\d+\)[:：]\s*/i, '')
    .replace(/^HTTP\s*\d+[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return '未知失败原因';
  }

  if (cleaned.length <= 220) {
    return cleaned;
  }

  return `${cleaned.slice(0, 219)}…`;
}

export function buildNotificationFailureSummary(
  events: DataOpsNotificationEvent[],
  options: {
    availableChannelIds: ReadonlySet<string>;
    limit?: number;
  }
): NotificationFailureReasonSummaryItem[] {
  const reasonMap = new Map<
    string,
    { count: number; retryableCount: number; eventIds: Set<string>; titles: Set<string> }
  >();

  for (const event of events) {
    const reason = normalizeNotificationFailureReason(event.detail);
    const current = reasonMap.get(reason);
    if (!current) {
      reasonMap.set(reason, {
        count: 1,
        retryableCount: options.availableChannelIds.has(event.channelId) ? 1 : 0,
        eventIds: new Set([event.id]),
        titles: new Set([event.title]),
      });
      continue;
    }

    current.count += 1;
    if (options.availableChannelIds.has(event.channelId)) {
      current.retryableCount += 1;
    }
    current.eventIds.add(event.id);
    current.titles.add(event.title);
  }

  return Array.from(reasonMap.entries())
    .map(([reason, stats]) => ({
      reason,
      count: stats.count,
      retryableCount: stats.retryableCount,
      eventIds: Array.from(stats.eventIds),
      titles: Array.from(stats.titles),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.reason.localeCompare(right.reason, 'zh-CN');
    })
    .slice(0, options.limit ?? 8);
}

export function filterNotificationEventsByFailureReason(
  events: DataOpsNotificationEvent[],
  reason: string
): DataOpsNotificationEvent[] {
  const selectedReason = reason.trim();
  if (!selectedReason) {
    return [];
  }

  return events.filter((item) => normalizeNotificationFailureReason(item.detail) === selectedReason);
}

export function filterRetryableNotificationEvents(
  events: DataOpsNotificationEvent[],
  availableChannelIds: ReadonlySet<string>
): DataOpsNotificationEvent[] {
  return events.filter((item) => availableChannelIds.has(item.channelId));
}

export function buildNotificationFailureStats(options: {
  totalCount: number;
  failedEvents: DataOpsNotificationEvent[];
  retryableFailedEvents: DataOpsNotificationEvent[];
}): NotificationFailureStats {
  return {
    totalCount: options.totalCount,
    failedCount: options.failedEvents.length,
    retryableFailedCount: options.retryableFailedEvents.length,
    impactedChannelIds: Array.from(new Set(options.failedEvents.map((item) => item.channelId))),
    impactedEventIds: Array.from(new Set(options.failedEvents.map((item) => item.id))),
  };
}
