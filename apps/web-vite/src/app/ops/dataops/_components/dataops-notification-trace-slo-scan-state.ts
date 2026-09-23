import { useCallback, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { MessageInstance } from 'antd/es/message/interface';

import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import { request } from '@/lib/request';
import type { DataOpsNotificationTraceSloScanResponse } from '@/types/dataops';
import { getActionErrorMessage } from './dataops-action-helpers';
import type { BatchHistoryAlertSendFormValues } from './dataops-batch-helpers';
import { openDataOpsNotificationTraceSloScanAlertDraft } from './dataops-alert-draft-helpers';
import { copyDataOpsNormalizedText } from './dataops-feedback-actions';
import type {
  AlertSendModalSource,
  NotificationTraceSloScanQuickFilter,
  NotificationTraceSloScanRankedItem,
} from './dataops-hub-formatters';
import {
  buildNotificationTraceSloScanRankedItems,
  buildNotificationTraceSloScanRiskSummary,
  filterNotificationTraceSloScanItems,
} from './dataops-notification-retry-helpers';
import {
  buildNotificationTraceSloScanFeedback,
  buildNotificationTraceSloScanNormalizedPayload,
} from './dataops-notification-trace-slo-scan-helpers';
import {
  buildDataOpsNotificationTraceSloScanColumns,
  buildDataOpsNotificationTraceSloScanMobileColumns,
} from './dataops-notification-trace-columns';
import { buildNotificationTraceSloScanMarkdownText } from './dataops-report-helpers';

export function useDataOpsNotificationTraceSloScanState(options: {
  availableAlertChannels: DataOpsNotificationChannel[];
  copyText: (text: string, label: string) => Promise<void>;
  defaultAlertChannel: DataOpsNotificationChannel | null | undefined;
  hasOperatePermission: boolean;
  message: MessageInstance;
  onOpenRetryGroupTrace: (retryGroupId: string) => void;
  openAlertDraft: (draftOptions: {
    formValues: BatchHistoryAlertSendFormValues;
    source: AlertSendModalSource;
    truncatedWarningText?: string;
  }) => void;
  refetchRuntime: () => Promise<unknown>;
}) {
  const {
    availableAlertChannels,
    copyText,
    defaultAlertChannel,
    hasOperatePermission,
    message,
    onOpenRetryGroupTrace,
    openAlertDraft,
    refetchRuntime,
  } = options;
  const [notificationTraceSloScanModalOpen, setNotificationTraceSloScanModalOpen] =
    useState(false);
  const [notificationTraceSloScanRunning, setNotificationTraceSloScanRunning] =
    useState(false);
  const [notificationTraceSloScanDryRun, setNotificationTraceSloScanDryRun] =
    useState(true);
  const [notificationTraceSloScanLookbackHours, setNotificationTraceSloScanLookbackHours] =
    useState(24);
  const [notificationTraceSloScanMaxGroups, setNotificationTraceSloScanMaxGroups] =
    useState(30);
  const [notificationTraceSloScanConcurrency, setNotificationTraceSloScanConcurrency] =
    useState(4);
  const [notificationTraceSloScanResult, setNotificationTraceSloScanResult] =
    useState<DataOpsNotificationTraceSloScanResponse | null>(null);
  const [notificationTraceSloScanQuickFilter, setNotificationTraceSloScanQuickFilter] =
    useState<NotificationTraceSloScanQuickFilter>('all');

  const openNotificationTraceSloScanModal = useCallback(() => {
    if (!hasOperatePermission) {
      message.warning('当前账号仅有查看权限，无法执行SLO巡检。');
      return;
    }

    setNotificationTraceSloScanModalOpen(true);
  }, [hasOperatePermission, message]);

  const closeNotificationTraceSloScanModal = useCallback(() => {
    if (notificationTraceSloScanRunning) {
      return;
    }

    setNotificationTraceSloScanModalOpen(false);
  }, [notificationTraceSloScanRunning]);

  const openRetryGroupTraceFromSloScan = useCallback(
    (retryGroupId: string) => {
      setNotificationTraceSloScanModalOpen(false);
      onOpenRetryGroupTrace(retryGroupId);
    },
    [onOpenRetryGroupTrace]
  );

  const runNotificationTraceSloScan = useCallback(async () => {
    if (!hasOperatePermission) {
      message.warning('当前账号仅有查看权限，无法执行SLO巡检。');
      return;
    }

    if (notificationTraceSloScanRunning) {
      return;
    }

    const scanPayload = buildNotificationTraceSloScanNormalizedPayload({
      dryRun: notificationTraceSloScanDryRun,
      lookbackHours: notificationTraceSloScanLookbackHours,
      maxGroups: notificationTraceSloScanMaxGroups,
      scanConcurrency: notificationTraceSloScanConcurrency,
    });

    setNotificationTraceSloScanLookbackHours(scanPayload.lookbackHours);
    setNotificationTraceSloScanMaxGroups(scanPayload.maxGroups);
    setNotificationTraceSloScanConcurrency(scanPayload.scanConcurrency);
    setNotificationTraceSloScanRunning(true);

    try {
      const result = await request.post<DataOpsNotificationTraceSloScanResponse>(
        '/dataops/runtime/notification-trace/scan',
        scanPayload,
        {
          cancelPrevious: false,
          requestKey: 'dataops-notification-trace-slo-scan',
        }
      );

      setNotificationTraceSloScanResult(result);
      setNotificationTraceSloScanQuickFilter('all');
      await refetchRuntime();

      const { successMessage, warningMessage } =
        buildNotificationTraceSloScanFeedback(result);
      message.success(successMessage);
      if (warningMessage) {
        message.warning(warningMessage);
      }
    } catch (error) {
      message.error(`执行SLO巡检失败：${getActionErrorMessage(error)}`);
    } finally {
      setNotificationTraceSloScanRunning(false);
    }
  }, [
    hasOperatePermission,
    message,
    notificationTraceSloScanConcurrency,
    notificationTraceSloScanDryRun,
    notificationTraceSloScanLookbackHours,
    notificationTraceSloScanMaxGroups,
    notificationTraceSloScanRunning,
    refetchRuntime,
  ]);

  const notificationTraceSloScanRankedItems = useMemo<
    NotificationTraceSloScanRankedItem[]
  >(() => {
    const items = notificationTraceSloScanResult?.items || [];
    return buildNotificationTraceSloScanRankedItems(items);
  }, [notificationTraceSloScanResult?.items]);

  const notificationTraceSloScanDisplayedItems = useMemo(
    () =>
      filterNotificationTraceSloScanItems(
        notificationTraceSloScanRankedItems,
        notificationTraceSloScanQuickFilter
      ),
    [notificationTraceSloScanQuickFilter, notificationTraceSloScanRankedItems]
  );
  const notificationTraceSloScanRiskSummary = useMemo(
    () => buildNotificationTraceSloScanRiskSummary(notificationTraceSloScanRankedItems),
    [notificationTraceSloScanRankedItems]
  );
  const notificationTraceSloScanMarkdownText = useMemo(
    () =>
      buildNotificationTraceSloScanMarkdownText({
        result: notificationTraceSloScanResult,
        rankedItems: notificationTraceSloScanRankedItems,
        riskSummary: notificationTraceSloScanRiskSummary,
        generatedAtText: new Date().toLocaleString('zh-CN', { hour12: false }),
      }),
    [
      notificationTraceSloScanRankedItems,
      notificationTraceSloScanResult,
      notificationTraceSloScanRiskSummary,
    ]
  );

  const notificationTraceSloScanColumns: ColumnsType<NotificationTraceSloScanRankedItem> =
    useMemo(
      () =>
        buildDataOpsNotificationTraceSloScanColumns({
          onOpenRetryGroupTrace: openRetryGroupTraceFromSloScan,
        }),
      [openRetryGroupTraceFromSloScan]
    );
  const notificationTraceSloScanMobileColumns: ColumnsType<NotificationTraceSloScanRankedItem> =
    useMemo(
      () =>
        buildDataOpsNotificationTraceSloScanMobileColumns({
          onOpenRetryGroupTrace: openRetryGroupTraceFromSloScan,
        }),
      [openRetryGroupTraceFromSloScan]
    );

  const copyNotificationTraceSloScanMarkdown = useCallback(async () => {
    await copyDataOpsNormalizedText({
      text: notificationTraceSloScanMarkdownText,
      copy: copyText,
      label: '巡检值班摘要',
      onEmpty: () => message.info('当前没有可复制的巡检值班摘要。'),
    });
  }, [copyText, message, notificationTraceSloScanMarkdownText]);

  const openNotifyTraceSloScanAlertModal = useCallback(() => {
    if (!hasOperatePermission) {
      message.warning('当前账号仅有查看权限，无法发送通知。');
      return;
    }

    const templateText = notificationTraceSloScanMarkdownText.trim();
    if (!templateText) {
      message.info('当前没有可发送的巡检值班摘要。');
      return;
    }

    openDataOpsNotificationTraceSloScanAlertDraft({
      availableChannels: availableAlertChannels,
      defaultChannelId: defaultAlertChannel?.id,
      templateText,
    }, {
      info: message.info,
      warning: message.warning,
      openDraft: openAlertDraft,
    });
  }, [
    availableAlertChannels,
    defaultAlertChannel,
    hasOperatePermission,
    message,
    notificationTraceSloScanMarkdownText,
    openAlertDraft,
  ]);

  return {
    notificationTraceSloScanModalOpen,
    notificationTraceSloScanDryRun,
    setNotificationTraceSloScanDryRun,
    notificationTraceSloScanRunning,
    notificationTraceSloScanLookbackHours,
    setNotificationTraceSloScanLookbackHours,
    notificationTraceSloScanMaxGroups,
    setNotificationTraceSloScanMaxGroups,
    notificationTraceSloScanConcurrency,
    setNotificationTraceSloScanConcurrency,
    notificationTraceSloScanResult,
    notificationTraceSloScanRiskSummary,
    notificationTraceSloScanQuickFilter,
    setNotificationTraceSloScanQuickFilter,
    notificationTraceSloScanRankedItems,
    notificationTraceSloScanDisplayedItems,
    notificationTraceSloScanMarkdownText,
    notificationTraceSloScanColumns,
    notificationTraceSloScanMobileColumns,
    openNotificationTraceSloScanModal,
    closeNotificationTraceSloScanModal,
    runNotificationTraceSloScan,
    copyNotificationTraceSloScanMarkdown,
    openNotifyTraceSloScanAlertModal,
  };
}
