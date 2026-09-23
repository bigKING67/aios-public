import { useCallback, useEffect, useMemo } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import type {
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
} from '@/config/dataops-hub';
import {
  copyDataOpsLines,
  exportDataOpsNotificationEventsCsv,
  type DataOpsCsvExportActionOptions,
} from './dataops-feedback-actions';
import {
  getNotificationStatusFilterLabel,
  type NotificationStatusFilter,
} from './dataops-hub-formatters';
import {
  buildDataOpsNotificationFailureDerivedState,
  buildDataOpsNotificationFilterLabels,
} from './dataops-hub-selectors';
import {
  filterNotificationEvents,
  filterRetryableNotificationEvents,
} from './dataops-notification-retry-helpers';

type NotificationChannelMap = Map<string, DataOpsNotificationChannel>;

export function useDataOpsNotificationFilterState(options: {
  availableAlertChannelIds: ReadonlySet<string>;
  channelFilter: string;
  copyText: (text: string, label: string) => Promise<void>;
  exportCsv: (options: DataOpsCsvExportActionOptions) => Promise<void>;
  keywordInput: string;
  message: MessageInstance;
  normalizedKeyword: string;
  normalizedNotifyReasonHashFilter: string;
  normalizedNotifyRetryGroupIdFilter: string;
  notificationChannelMap: NotificationChannelMap;
  notificationEventTypeFilter: string;
  notificationEvents: DataOpsNotificationEvent[];
  notificationStatusFilter: NotificationStatusFilter;
  notifyFailureChannelFocus: string;
  selectedNotifyFailureReason: string;
  setChannelFilter: (value: string) => void;
  setNotificationEventTypeFilter: (value: string) => void;
  setNotificationStatusFilter: (value: NotificationStatusFilter) => void;
  setNotifyFailureChannelFocus: (value: string) => void;
  setNotifyReasonHashFilter: (value: string) => void;
  setNotifyRetryGroupIdFilter: (value: string) => void;
  setSelectedNotifyFailureReason: (value: string) => void;
}) {
  const {
    availableAlertChannelIds,
    channelFilter,
    copyText,
    exportCsv,
    keywordInput,
    message,
    normalizedKeyword,
    normalizedNotifyReasonHashFilter,
    normalizedNotifyRetryGroupIdFilter,
    notificationChannelMap,
    notificationEventTypeFilter,
    notificationEvents,
    notificationStatusFilter,
    notifyFailureChannelFocus,
    selectedNotifyFailureReason,
    setChannelFilter,
    setNotificationEventTypeFilter,
    setNotificationStatusFilter,
    setNotifyFailureChannelFocus,
    setNotifyReasonHashFilter,
    setNotifyRetryGroupIdFilter,
    setSelectedNotifyFailureReason,
  } = options;

  const filteredEvents = useMemo(() => {
    return filterNotificationEvents(notificationEvents, {
      channelFilter,
      eventTypeFilter: notificationEventTypeFilter,
      statusFilter: notificationStatusFilter,
      normalizedReasonHashFilter: normalizedNotifyReasonHashFilter,
      normalizedRetryGroupIdFilter: normalizedNotifyRetryGroupIdFilter,
      selectedFailureReason: selectedNotifyFailureReason,
      normalizedKeyword,
    });
  }, [
    channelFilter,
    normalizedKeyword,
    normalizedNotifyReasonHashFilter,
    normalizedNotifyRetryGroupIdFilter,
    notificationEventTypeFilter,
    notificationEvents,
    notificationStatusFilter,
    selectedNotifyFailureReason,
  ]);

  const filteredFailedNotificationEvents = useMemo(
    () => filteredEvents.filter((item) => item.status === 'failed'),
    [filteredEvents]
  );
  const filteredRetryableFailedNotificationEvents = useMemo(
    () =>
      filterRetryableNotificationEvents(
        filteredFailedNotificationEvents,
        availableAlertChannelIds
      ),
    [availableAlertChannelIds, filteredFailedNotificationEvents]
  );
  const notificationFilterLabels = useMemo(
    () =>
      buildDataOpsNotificationFilterLabels({
        channelFilter,
        eventTypeFilter: notificationEventTypeFilter,
        statusLabel: getNotificationStatusFilterLabel(notificationStatusFilter),
        notifyFailureChannelFocus,
        selectedFailureReason: selectedNotifyFailureReason,
        normalizedReasonHashFilter: normalizedNotifyReasonHashFilter,
        normalizedRetryGroupIdFilter: normalizedNotifyRetryGroupIdFilter,
        keyword: keywordInput,
        channelMap: notificationChannelMap,
      }),
    [
      channelFilter,
      keywordInput,
      normalizedNotifyReasonHashFilter,
      normalizedNotifyRetryGroupIdFilter,
      notificationChannelMap,
      notificationEventTypeFilter,
      notificationStatusFilter,
      notifyFailureChannelFocus,
      selectedNotifyFailureReason,
    ]
  );
  const notificationFailureDerivedState = useMemo(
    () =>
      buildDataOpsNotificationFailureDerivedState({
        filteredEvents,
        filteredFailedEvents: filteredFailedNotificationEvents,
        availableChannelIds: availableAlertChannelIds,
        channelMap: notificationChannelMap,
        notifyFailureChannelFocus,
        selectedFailureReason: selectedNotifyFailureReason,
        labels: notificationFilterLabels,
        generatedAtText: new Date().toLocaleString('zh-CN', { hour12: false }),
      }),
    [
      availableAlertChannelIds,
      filteredEvents,
      filteredFailedNotificationEvents,
      notificationChannelMap,
      notificationFilterLabels,
      notifyFailureChannelFocus,
      selectedNotifyFailureReason,
    ]
  );

  const notificationFailureSummary = notificationFailureDerivedState.summary;
  const selectedReasonFailedNotificationEvents =
    notificationFailureDerivedState.selectedReasonFailedEvents;
  const selectedReasonRetryableFailedNotificationEvents =
    notificationFailureDerivedState.selectedReasonRetryableFailedEvents;

  const applyNotifyReasonFilter = useCallback((reason: string) => {
    setSelectedNotifyFailureReason(reason);
    setNotificationStatusFilter('failed');
  }, [setNotificationStatusFilter, setSelectedNotifyFailureReason]);
  const applyNotifyReasonHashFilter = useCallback((reasonHash: string) => {
    const normalized = reasonHash.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    setNotifyReasonHashFilter(normalized);
    setNotificationStatusFilter('failed');
  }, [setNotificationStatusFilter, setNotifyReasonHashFilter]);
  const applyNotifyRetryGroupFilter = useCallback((retryGroupId: string) => {
    const normalized = retryGroupId.trim();
    if (!normalized) {
      return;
    }

    setNotifyRetryGroupIdFilter(normalized);
  }, [setNotifyRetryGroupIdFilter]);

  useEffect(() => {
    if (!selectedNotifyFailureReason) {
      return;
    }

    const stillExists = notificationFailureSummary.some(
      (item) => item.reason === selectedNotifyFailureReason
    );
    if (!stillExists) {
      setSelectedNotifyFailureReason('');
    }
  }, [
    notificationFailureSummary,
    selectedNotifyFailureReason,
    setSelectedNotifyFailureReason,
  ]);

  const resetNotifyFilters = useCallback(() => {
    setChannelFilter('all');
    setNotificationEventTypeFilter('all');
    setNotificationStatusFilter('all');
    setNotifyFailureChannelFocus('all');
    setSelectedNotifyFailureReason('');
    setNotifyReasonHashFilter('');
    setNotifyRetryGroupIdFilter('');
  }, [
    setChannelFilter,
    setNotificationEventTypeFilter,
    setNotificationStatusFilter,
    setNotifyFailureChannelFocus,
    setNotifyReasonHashFilter,
    setNotifyRetryGroupIdFilter,
    setSelectedNotifyFailureReason,
  ]);
  const filteredFailedNotificationEventIds = useMemo(
    () => Array.from(new Set(filteredFailedNotificationEvents.map((item) => item.id))),
    [filteredFailedNotificationEvents]
  );
  const copyFilteredFailedNotificationEventIds = useCallback(async () => {
    await copyDataOpsLines({
      lines: filteredFailedNotificationEventIds,
      copy: copyText,
      label: '筛选失败通知事件ID列表',
      onEmpty: () => message.info('当前筛选条件下没有失败通知事件。'),
    });
  }, [copyText, filteredFailedNotificationEventIds, message]);
  const exportFilteredNotificationEventsCsv = useCallback(async () => {
    await exportDataOpsNotificationEventsCsv({
      filteredEvents,
      notificationChannelMap,
      exportCsv,
      info: message.info,
    });
  }, [exportCsv, filteredEvents, message, notificationChannelMap]);

  return {
    filteredEvents,
    filteredFailedNotificationEvents,
    filteredRetryableFailedNotificationEvents,
    notificationFailureAlertTemplateText: notificationFailureDerivedState.alertTemplateText,
    notificationFailureSummary,
    notificationFailureSummaryText: notificationFailureDerivedState.summaryText,
    notificationMarkdownText: notificationFailureDerivedState.markdownText,
    notifyFailureChannelOptions: notificationFailureDerivedState.failureChannelOptions,
    selectedReasonFailedNotificationEvents,
    selectedReasonRetryableFailedNotificationEvents,
    filteredFailedNotificationEventIds,
    applyNotifyReasonFilter,
    applyNotifyReasonHashFilter,
    applyNotifyRetryGroupFilter,
    copyFilteredFailedNotificationEventIds,
    exportFilteredNotificationEventsCsv,
    resetNotifyFilters,
  };
}
