import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import type {
  DataOpsActionRequest,
  DataOpsActionResponse,
} from '@/types/dataops';
import {
  buildNotificationRetryDraft,
  type NotificationRetryExecutionOptions,
  type NotificationRetryReportItem,
} from './dataops-notification-retry-helpers';
import {
  buildStableRetryReasonToken,
  formatTokenPreview,
  truncateText,
} from './dataops-hub-formatters';

type ChannelNameMap = ReadonlyMap<string, { channelName: string }>;

export interface OrderedNotificationRetryReportItem {
  order: number;
  item: NotificationRetryReportItem;
}

export interface NotificationRetryWebhookRequest {
  payload: DataOpsActionRequest;
  requestKey: string;
}

export function buildNotificationFilteredRetryOptions(options: {
  targetFailedEvents: DataOpsNotificationEvent[];
}): NotificationRetryExecutionOptions {
  return {
    targetFailedEvents: options.targetFailedEvents,
    confirmTitle: '按筛选批量重发失败通知',
    doneLabel: '按筛选重发完成',
    requestKeyPrefix: 'dataops-notify-retry',
    retryGroupId: `notify-retry-filter-${Date.now().toString(36)}`,
    emptyText: '当前筛选条件下没有失败通知记录。',
  };
}

export function buildNotificationReasonRetryOptions(options: {
  selectedReason: string;
  targetFailedEvents: DataOpsNotificationEvent[];
}): NotificationRetryExecutionOptions {
  const reasonPreview = truncateText(options.selectedReason, 20);

  return {
    targetFailedEvents: options.targetFailedEvents,
    confirmTitle: `按原因重发失败通知 · ${reasonPreview}`,
    doneLabel: `按原因重发完成 · ${reasonPreview}`,
    requestKeyPrefix: 'dataops-notify-reason-retry',
    retryGroupId: `notify-retry-reason-${buildStableRetryReasonToken(
      options.selectedReason
    )}-${Date.now().toString(36)}`,
    emptyText: '当前选中原因下没有失败通知记录。',
  };
}

function resolveTraceRetryGroupId(activeRetryGroupTraceId: string): string {
  return activeRetryGroupTraceId.trim() || `notify-retry-trace-${Date.now().toString(36)}`;
}

export function buildNotificationTraceRetryOptions(options: {
  activeRetryGroupTraceId: string;
  targetFailedEvents: DataOpsNotificationEvent[];
  retryableOnly: boolean;
}): NotificationRetryExecutionOptions {
  const retryGroupId = resolveTraceRetryGroupId(options.activeRetryGroupTraceId);
  const groupPreview = formatTokenPreview(retryGroupId, 18);

  return {
    targetFailedEvents: options.targetFailedEvents,
    confirmTitle: options.retryableOnly
      ? `链路重发可重发失败 · ${groupPreview}`
      : `链路重发失败通知 · ${groupPreview}`,
    doneLabel: options.retryableOnly
      ? `链路可重发失败重发完成 · ${groupPreview}`
      : `链路重发完成 · ${groupPreview}`,
    requestKeyPrefix: options.retryableOnly
      ? 'dataops-notify-trace-retryable'
      : 'dataops-notify-trace-retry',
    retryGroupId,
    emptyText: options.retryableOnly
      ? '当前链路下没有可重发失败通知记录。'
      : '当前链路下没有失败通知记录。',
  };
}

export function buildNotificationRetrySkippedReportItems(options: {
  retryableEventsCount: number;
  skippedEvents: DataOpsNotificationEvent[];
  channelMap: ChannelNameMap;
}): OrderedNotificationRetryReportItem[] {
  return options.skippedEvents.map((event, index) => {
    const channelName = options.channelMap.get(event.channelId)?.channelName || event.channelId;

    return {
      order: options.retryableEventsCount + index,
      item: {
        eventId: event.id,
        title: event.title,
        channelId: event.channelId,
        channelName,
        status: 'skipped',
        message: '通道不可用，已跳过',
      },
    };
  });
}

export function buildNotificationRetryWebhookRequest(options: {
  event: DataOpsNotificationEvent;
  nowText: string;
  retryGroupId: string;
  requestKeyPrefix: string;
  index: number;
}): NotificationRetryWebhookRequest {
  const retryDraft = buildNotificationRetryDraft(options.event, options.nowText);

  return {
    payload: {
      action: 'test_channel_webhook',
      channelId: options.event.channelId,
      parameters: {
        messageTitle: retryDraft.title,
        messageText: retryDraft.text,
        retryGroupId: options.retryGroupId,
      },
    },
    requestKey: `${options.requestKeyPrefix}-${options.event.id}-${options.index + 1}`,
  };
}

export function buildNotificationRetryResultReportItem(options: {
  event: DataOpsNotificationEvent;
  channelMap: ChannelNameMap;
  order: number;
  result: DataOpsActionResponse;
}): {
  orderedItem: OrderedNotificationRetryReportItem;
  failureSample?: string;
} {
  const channelName = options.channelMap.get(options.event.channelId)?.channelName || options.event.channelId;

  if (options.result.success) {
    return {
      orderedItem: {
        order: options.order,
        item: {
          eventId: options.event.id,
          title: options.event.title,
          channelId: options.event.channelId,
          channelName,
          status: 'success',
          message: options.result.message || '发送成功',
        },
      },
    };
  }

  const failureMessage = options.result.message || '发送失败';
  return {
    orderedItem: {
      order: options.order,
      item: {
        eventId: options.event.id,
        title: options.event.title,
        channelId: options.event.channelId,
        channelName,
        status: 'failed',
        message: failureMessage,
      },
    },
    failureSample: `${options.event.title}: ${failureMessage}`,
  };
}

export function buildNotificationRetryErrorReportItem(options: {
  event: DataOpsNotificationEvent;
  channelMap: ChannelNameMap;
  order: number;
  failureMessage: string;
}): OrderedNotificationRetryReportItem {
  const channelName = options.channelMap.get(options.event.channelId)?.channelName || options.event.channelId;

  return {
    order: options.order,
    item: {
      eventId: options.event.id,
      title: options.event.title,
      channelId: options.event.channelId,
      channelName,
      status: 'failed',
      message: options.failureMessage,
    },
  };
}

export function orderNotificationRetryReportItems(
  orderedItems: OrderedNotificationRetryReportItem[]
): NotificationRetryReportItem[] {
  return orderedItems
    .sort((left, right) => left.order - right.order)
    .map((item) => item.item);
}
