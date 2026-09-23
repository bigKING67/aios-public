import type {
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
} from '@/config/dataops-hub';
import type { BatchHistoryAlertSendFormValues } from './dataops-batch-helpers';
import type { AlertSendModalSource } from './dataops-hub-formatters';
import {
  buildNotificationRetryDraft,
  buildNotificationFailureSummaryAlertDraft,
  buildNotificationMarkdownAlertDraft,
  buildNotificationTraceSloScanAlertDraft,
  type NotificationAlertDraft,
} from './dataops-notification-retry-helpers';

export interface DataOpsAlertDraft {
  formValues: BatchHistoryAlertSendFormValues;
  truncatedWarningText?: string;
}

export interface DataOpsAlertDraftOpenOptions {
  alertDraft: DataOpsAlertDraft | NotificationAlertDraft | null;
  emptyText: string;
  source: AlertSendModalSource;
  targetChannelId: string;
}

export interface DataOpsAlertDraftResetHandlers {
  resetFields: () => void;
  setOpen: (open: boolean) => void;
  setSource: (source: AlertSendModalSource) => void;
  setSubmitting: (submitting: boolean) => void;
}

interface DataOpsAlertDraftOpenHandlers {
  warning: (content: string) => void;
  openDraft: (draftOptions: {
    formValues: BatchHistoryAlertSendFormValues;
    source: AlertSendModalSource;
    truncatedWarningText?: string;
  }) => void;
}

function formatDataOpsAlertNowText(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

export function resolveDataOpsDefaultAlertChannelId(
  defaultChannelId: string | undefined,
  availableChannelIds: readonly string[]
): string {
  return defaultChannelId || availableChannelIds[0] || '';
}

function resolveDataOpsDefaultAlertChannelIdFromChannels(
  defaultChannelId: string | undefined,
  availableChannels: readonly { id: string }[]
): string {
  return resolveDataOpsDefaultAlertChannelId(
    defaultChannelId,
    availableChannels.map((item) => item.id)
  );
}

export function openDataOpsAlertDraft(
  options: DataOpsAlertDraftOpenOptions,
  handlers: {
    info: (content: string) => void;
    warning: (content: string) => void;
    openDraft: (draftOptions: {
      formValues: BatchHistoryAlertSendFormValues;
      source: AlertSendModalSource;
      truncatedWarningText?: string;
    }) => void;
  }
): void {
  if (!options.alertDraft) {
    handlers.info(options.emptyText);
    return;
  }

  if (!options.targetChannelId) {
    handlers.warning('当前没有可用的 Webhook 通道。');
    return;
  }

  handlers.openDraft({
    formValues: options.alertDraft.formValues,
    source: options.source,
    truncatedWarningText: options.alertDraft.truncatedWarningText,
  });
}

export function resetDataOpsAlertDraftModal(
  handlers: DataOpsAlertDraftResetHandlers
): void {
  handlers.setOpen(false);
  handlers.setSubmitting(false);
  handlers.setSource('batch_history');
  handlers.resetFields();
}

export function openDataOpsNotificationMarkdownAlertDraft(
  options: {
    availableChannels: readonly { id: string }[];
    defaultChannelId: string | undefined;
    markdownText: string;
  },
  handlers: Parameters<typeof openDataOpsAlertDraft>[1]
): void {
  const targetChannelId = resolveDataOpsDefaultAlertChannelIdFromChannels(
    options.defaultChannelId,
    options.availableChannels
  );

  openDataOpsAlertDraft({
    alertDraft: buildNotificationMarkdownAlertDraft({
      markdownText: options.markdownText,
      targetChannelId,
    }),
    emptyText: '当前筛选结果下没有可发送的 Markdown 报告。',
    source: 'notify_markdown',
    targetChannelId,
  }, handlers);
}

export function openDataOpsBatchHistoryAlertDraft(
  options: {
    availableChannels: readonly { id: string }[];
    defaultChannelId: string | undefined;
    templateText: string;
  },
  handlers: Parameters<typeof openDataOpsAlertDraft>[1]
): void {
  const alertText = options.templateText.trim();
  if (!alertText) {
    handlers.info('当前筛选结果下没有可发送的告警模板。');
    return;
  }

  const targetChannelId = resolveDataOpsDefaultAlertChannelIdFromChannels(
    options.defaultChannelId,
    options.availableChannels
  );

  openDataOpsAlertDraft({
    alertDraft: {
      formValues: {
        channelId: targetChannelId,
        messageTitle: '[DataOps Hub] 批量历史失败告警',
        messageText: alertText,
      },
    },
    emptyText: '当前筛选结果下没有可发送的告警模板。',
    source: 'batch_history',
    targetChannelId,
  }, handlers);
}

export function openDataOpsChannelManualNotifyDraft(
  options: {
    channel: DataOpsNotificationChannel;
    hasOperatePermission: boolean;
  },
  handlers: DataOpsAlertDraftOpenHandlers
): void {
  if (!options.hasOperatePermission) {
    handlers.warning('当前账号仅有查看权限，无法发送通知。');
    return;
  }

  const canOperate = options.channel.enabled && options.channel.status !== 'paused';
  if (!canOperate) {
    handlers.warning('当前通道未启用或处于停用状态，无法发送通知。');
    return;
  }

  handlers.openDraft({
    formValues: {
      channelId: options.channel.id,
      messageTitle: '[DataOps Hub] 手动通知',
      messageText: `时间：${formatDataOpsAlertNowText()}\n说明：`,
    },
    source: 'notify_channel',
  });
}

export function openDataOpsNotificationEventRetryDraft(
  options: {
    event: DataOpsNotificationEvent;
    availableChannels: readonly DataOpsNotificationChannel[];
    hasOperatePermission: boolean;
    notificationChannelMap: ReadonlyMap<string, { channelName: string }>;
  },
  handlers: DataOpsAlertDraftOpenHandlers
): void {
  if (!options.hasOperatePermission) {
    handlers.warning('当前账号仅有查看权限，无法发送通知。');
    return;
  }

  const channel = options.availableChannels.find((item) => item.id === options.event.channelId);
  if (!channel) {
    const fallbackChannelName =
      options.notificationChannelMap.get(options.event.channelId)?.channelName ||
      options.event.channelId;
    handlers.warning(`事件来源通道「${fallbackChannelName}」不可用，请启用后重试。`);
    return;
  }

  const retryDraft = buildNotificationRetryDraft(
    options.event,
    formatDataOpsAlertNowText()
  );

  handlers.openDraft({
    formValues: {
      channelId: channel.id,
      messageTitle: retryDraft.title,
      messageText: retryDraft.text,
    },
    source: 'notify_event_retry',
  });
}

export function openDataOpsNotificationFailureSummaryAlertDraft(
  options: {
    availableChannels: readonly { id: string }[];
    defaultChannelId: string | undefined;
    templateText: string;
  },
  handlers: Parameters<typeof openDataOpsAlertDraft>[1]
): void {
  const targetChannelId = resolveDataOpsDefaultAlertChannelIdFromChannels(
    options.defaultChannelId,
    options.availableChannels
  );

  openDataOpsAlertDraft({
    alertDraft: buildNotificationFailureSummaryAlertDraft({
      templateText: options.templateText,
      targetChannelId,
    }),
    emptyText: '当前筛选结果下没有可发送的失败告警模板。',
    source: 'notify_failure_summary',
    targetChannelId,
  }, handlers);
}

export function openDataOpsNotificationTraceSloScanAlertDraft(
  options: {
    availableChannels: readonly { id: string }[];
    defaultChannelId: string | undefined;
    templateText: string;
  },
  handlers: Parameters<typeof openDataOpsAlertDraft>[1]
): void {
  const targetChannelId = resolveDataOpsDefaultAlertChannelIdFromChannels(
    options.defaultChannelId,
    options.availableChannels
  );

  openDataOpsAlertDraft({
    alertDraft: buildNotificationTraceSloScanAlertDraft({
      templateText: options.templateText,
      targetChannelId,
    }),
    emptyText: '当前没有可发送的巡检值班摘要。',
    source: 'notify_trace_slo_scan',
    targetChannelId,
  }, handlers);
}
