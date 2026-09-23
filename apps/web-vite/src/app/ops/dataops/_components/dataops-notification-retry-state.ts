import { useCallback, useState } from 'react';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';
import type { MessageInstance } from 'antd/es/message/interface';

import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import { request } from '@/lib/request';
import type { DataOpsActionResponse } from '@/types/dataops';
import {
  forEachWithConcurrency,
  getActionErrorMessage,
} from './dataops-action-helpers';
import type {
  NotificationRetryConcurrency,
} from './dataops-hub-formatters';
import type {
  NotificationRetryExecutionOptions,
  NotificationRetryReport,
} from './dataops-notification-retry-helpers';
import {
  buildNotificationFilteredRetryOptions,
  buildNotificationReasonRetryOptions,
  buildNotificationRetryErrorReportItem,
  buildNotificationRetryResultReportItem,
  buildNotificationRetrySkippedReportItems,
  buildNotificationRetryWebhookRequest,
  buildNotificationTraceRetryOptions,
  orderNotificationRetryReportItems,
  type OrderedNotificationRetryReportItem,
} from './dataops-notification-retry-report-helpers';

type NotificationChannelMap = ReadonlyMap<string, { channelName: string }>;

export function useDataOpsNotificationRetryState(options: {
  activeRetryGroupTraceId: string;
  availableAlertChannelIds: ReadonlySet<string>;
  filteredFailedNotificationEvents: DataOpsNotificationEvent[];
  hasOperatePermission: boolean;
  message: MessageInstance;
  modal: Pick<ModalStaticFunctions, 'confirm'>;
  notificationChannelMap: NotificationChannelMap;
  refetchRuntime: () => Promise<unknown>;
  retryGroupTraceFailedEvents: DataOpsNotificationEvent[];
  retryGroupTraceRetryableFailedEvents: DataOpsNotificationEvent[];
  selectedNotifyFailureReason: string;
  selectedReasonFailedNotificationEvents: DataOpsNotificationEvent[];
}) {
  const {
    activeRetryGroupTraceId,
    availableAlertChannelIds,
    filteredFailedNotificationEvents,
    hasOperatePermission,
    message,
    modal,
    notificationChannelMap,
    refetchRuntime,
    retryGroupTraceFailedEvents,
    retryGroupTraceRetryableFailedEvents,
    selectedNotifyFailureReason,
    selectedReasonFailedNotificationEvents,
  } = options;
  const [notificationBatchRetrySubmitting, setNotificationBatchRetrySubmitting] =
    useState(false);
  const [notificationRetryConcurrency, setNotificationRetryConcurrency] =
    useState<NotificationRetryConcurrency>(2);
  const [notificationRetryReport, setNotificationRetryReport] =
    useState<NotificationRetryReport | null>(null);

  const retryNotificationEvents = useCallback(
    async (retryOptions: NotificationRetryExecutionOptions) => {
      if (!hasOperatePermission) {
        message.warning('当前账号仅有查看权限，无法执行重发。');
        return;
      }

      const targetFailedEvents = retryOptions.targetFailedEvents;
      if (!targetFailedEvents.length) {
        message.info(retryOptions.emptyText);
        return;
      }

      const retryableFailedEvents = targetFailedEvents.filter((item) =>
        availableAlertChannelIds.has(item.channelId)
      );
      if (!retryableFailedEvents.length) {
        message.warning('当前失败记录来源通道不可用，无法重发。');
        return;
      }

      const skippedCount = targetFailedEvents.length - retryableFailedEvents.length;
      const effectiveConcurrency = Math.max(
        1,
        Math.min(notificationRetryConcurrency, retryableFailedEvents.length)
      );

      const confirmed = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: retryOptions.confirmTitle,
          content: `将重发 ${retryableFailedEvents.length} 条失败通知${
            skippedCount > 0 ? `（另有 ${skippedCount} 条通道不可用将跳过）` : ''
          }，并发档位 x${effectiveConcurrency}，是否继续？`,
          okText: '确认重发',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) {
        return;
      }

      setNotificationBatchRetrySubmitting(true);
      setNotificationRetryReport(null);
      let successCount = 0;
      let failedCount = 0;
      const failureSamples: string[] = [];
      const nowText = new Date().toLocaleString('zh-CN', { hour12: false });
      const retryableEventIdSet = new Set(retryableFailedEvents.map((item) => item.id));
      const skippedEvents = targetFailedEvents.filter((item) => !retryableEventIdSet.has(item.id));
      const reportItemsWithOrder: OrderedNotificationRetryReportItem[] =
        buildNotificationRetrySkippedReportItems({
          retryableEventsCount: retryableFailedEvents.length,
          skippedEvents,
          channelMap: notificationChannelMap,
        });

      try {
        await forEachWithConcurrency(
          retryableFailedEvents,
          effectiveConcurrency,
          async (event, index) => {
            try {
              const retryRequest = buildNotificationRetryWebhookRequest({
                event,
                nowText,
                retryGroupId: retryOptions.retryGroupId,
                requestKeyPrefix: retryOptions.requestKeyPrefix,
                index,
              });
              const result = await request.post<DataOpsActionResponse>(
                '/dataops/actions',
                retryRequest.payload,
                {
                  cancelPrevious: false,
                  requestKey: retryRequest.requestKey,
                }
              );
              const reportResult = buildNotificationRetryResultReportItem({
                event,
                channelMap: notificationChannelMap,
                order: index,
                result,
              });
              reportItemsWithOrder.push(reportResult.orderedItem);

              if (result.success) {
                successCount += 1;
              } else {
                failedCount += 1;
                if (reportResult.failureSample) {
                  failureSamples.push(reportResult.failureSample);
                }
              }
            } catch (error) {
              failedCount += 1;
              const failureMessage = getActionErrorMessage(error);
              failureSamples.push(`${event.title}: ${failureMessage}`);
              reportItemsWithOrder.push(buildNotificationRetryErrorReportItem({
                event,
                channelMap: notificationChannelMap,
                order: index,
                failureMessage,
              }));
            }
          }
        );

        setNotificationRetryReport({
          executedAt: nowText,
          concurrency: effectiveConcurrency,
          totalCount: targetFailedEvents.length,
          successCount,
          failedCount,
          skippedCount,
          items: orderNotificationRetryReportItems(reportItemsWithOrder),
        });
      } finally {
        await refetchRuntime();
        setNotificationBatchRetrySubmitting(false);
      }

      if (failedCount === 0) {
        message.success(
          `${retryOptions.doneLabel}：成功 ${successCount} 条${
            skippedCount > 0 ? `，跳过 ${skippedCount} 条通道不可用记录` : ''
          }。`
        );
        return;
      }

      message.warning(
        `${retryOptions.doneLabel}：成功 ${successCount} 条，失败 ${failedCount} 条${
          skippedCount > 0 ? `，跳过 ${skippedCount} 条` : ''
        }。`
      );
      if (failureSamples[0]) {
        message.warning(`失败示例：${failureSamples[0]}`);
      }
    },
    [
      availableAlertChannelIds,
      hasOperatePermission,
      message,
      modal,
      notificationChannelMap,
      notificationRetryConcurrency,
      refetchRuntime,
    ]
  );

  const retryFilteredFailedNotifications = useCallback(async () => {
    await retryNotificationEvents(buildNotificationFilteredRetryOptions({
      targetFailedEvents: filteredFailedNotificationEvents,
    }));
  }, [filteredFailedNotificationEvents, retryNotificationEvents]);

  const retrySelectedNotifyFailureReason = useCallback(async () => {
    const selectedReason = selectedNotifyFailureReason.trim();
    if (!selectedReason) {
      message.info('请先在失败原因聚合中选择一个原因。');
      return;
    }

    await retryNotificationEvents(buildNotificationReasonRetryOptions({
      targetFailedEvents: selectedReasonFailedNotificationEvents,
      selectedReason,
    }));
  }, [
    message,
    retryNotificationEvents,
    selectedNotifyFailureReason,
    selectedReasonFailedNotificationEvents,
  ]);

  const retryCurrentTraceFailedNotifications = useCallback(async () => {
    await retryNotificationEvents(buildNotificationTraceRetryOptions({
      activeRetryGroupTraceId,
      targetFailedEvents: retryGroupTraceFailedEvents,
      retryableOnly: false,
    }));
  }, [
    activeRetryGroupTraceId,
    retryGroupTraceFailedEvents,
    retryNotificationEvents,
  ]);

  const retryCurrentTraceRetryableNotifications = useCallback(async () => {
    await retryNotificationEvents(buildNotificationTraceRetryOptions({
      activeRetryGroupTraceId,
      targetFailedEvents: retryGroupTraceRetryableFailedEvents,
      retryableOnly: true,
    }));
  }, [
    activeRetryGroupTraceId,
    retryGroupTraceRetryableFailedEvents,
    retryNotificationEvents,
  ]);

  return {
    notificationBatchRetrySubmitting,
    notificationRetryConcurrency,
    setNotificationRetryConcurrency,
    notificationRetryReport,
    retryFilteredFailedNotifications,
    retrySelectedNotifyFailureReason,
    retryCurrentTraceFailedNotifications,
    retryCurrentTraceRetryableNotifications,
  };
}
