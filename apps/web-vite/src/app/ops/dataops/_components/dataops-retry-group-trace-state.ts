import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { MessageInstance } from 'antd/es/message/interface';

import type {
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
} from '@/config/dataops-hub';
import { useDataOpsNotificationTrace } from '@/hooks/use-dataops-notification-trace';
import { getActionErrorMessage } from './dataops-action-helpers';
import {
  copyDataOpsNormalizedText,
  exportDataOpsRetryGroupTraceCsv,
  type DataOpsCsvExportActionOptions,
} from './dataops-feedback-actions';
import {
  normalizeToken,
  type NotificationTraceFilter,
  type TabKey,
} from './dataops-hub-formatters';
import {
  buildDataOpsRetryGroupTraceDerivedState,
} from './dataops-hub-selectors';
import {
  applyRetryGroupTraceNotifyFilterState,
  clearRetryGroupTraceReasonHashFocusState,
  copyRetryGroupTraceShareLink,
  focusRetryGroupTraceReasonHashState,
  openRetryGroupTraceState,
} from './dataops-notification-trace-interaction-helpers';
import {
  buildDataOpsRetryGroupTraceColumns,
  buildDataOpsRetryGroupTraceMobileColumns,
} from './dataops-notification-trace-columns';
import type { DataOpsNotifyFilterState } from './dataops-query-helpers';
import { buildRetryGroupTraceMarkdownText } from './dataops-report-helpers';

type NotificationChannelMap = Map<string, DataOpsNotificationChannel>;

export function useDataOpsRetryGroupTraceState(options: {
  availableAlertChannelIds: ReadonlySet<string>;
  copyText: (text: string, label: string) => Promise<void>;
  exportCsv: (options: DataOpsCsvExportActionOptions) => Promise<void>;
  getCurrentNotifyShareFilters: () => DataOpsNotifyFilterState;
  isCompactViewport: boolean;
  message: MessageInstance;
  notificationChannelMap: NotificationChannelMap;
  notificationEvents: DataOpsNotificationEvent[];
  setActiveTab: (value: TabKey) => void;
  setNotifyRetryGroupIdFilter: (value: string) => void;
}) {
  const {
    availableAlertChannelIds,
    copyText,
    exportCsv,
    getCurrentNotifyShareFilters,
    isCompactViewport,
    message,
    notificationChannelMap,
    notificationEvents,
    setActiveTab,
    setNotifyRetryGroupIdFilter,
  } = options;

  const [retryGroupTraceModalOpen, setRetryGroupTraceModalOpen] = useState(false);
  const [activeRetryGroupTraceId, setActiveRetryGroupTraceId] = useState<string>('');
  const [pendingRetryGroupTraceIdFromUrl, setPendingRetryGroupTraceIdFromUrl] =
    useState<string>('');
  const [retryGroupTraceFilter, setRetryGroupTraceFilter] =
    useState<NotificationTraceFilter>('all');
  const [retryGroupTraceReasonHashFocus, setRetryGroupTraceReasonHashFocus] =
    useState<string>('all');

  const hasActiveRetryGroupTraceId = activeRetryGroupTraceId.trim().length > 0;
  const retryGroupTraceQuery = useDataOpsNotificationTrace({
    retryGroupId: activeRetryGroupTraceId,
    enabled: retryGroupTraceModalOpen && hasActiveRetryGroupTraceId,
    limit: 1200,
  });

  const normalizedRetryGroupTraceReasonHashFocus = useMemo(
    () => normalizeToken(retryGroupTraceReasonHashFocus),
    [retryGroupTraceReasonHashFocus]
  );

  const retryGroupTraceDerivedState = useMemo(
    () =>
      buildDataOpsRetryGroupTraceDerivedState({
        notificationEvents,
        activeRetryGroupTraceId,
        serverTraceData: retryGroupTraceQuery.data,
        availableChannelIds: availableAlertChannelIds,
        channelMap: notificationChannelMap,
        normalizedReasonHashFocus: normalizedRetryGroupTraceReasonHashFocus,
        traceFilter: retryGroupTraceFilter,
      }),
    [
      activeRetryGroupTraceId,
      availableAlertChannelIds,
      normalizedRetryGroupTraceReasonHashFocus,
      notificationChannelMap,
      notificationEvents,
      retryGroupTraceFilter,
      retryGroupTraceQuery.data,
    ]
  );

  const retryGroupTraceEvents = retryGroupTraceDerivedState.events;
  const retryGroupTraceFailedEvents = retryGroupTraceDerivedState.failedEvents;
  const retryGroupTraceRetryableFailedEvents =
    retryGroupTraceDerivedState.retryableFailedEvents;
  const retryGroupTraceReasonHashRecovery = retryGroupTraceDerivedState.reasonHashRecovery;
  const retryGroupTraceReasonHashFocusLabel =
    retryGroupTraceDerivedState.reasonHashFocusLabel;
  const filteredRetryGroupTraceEvents = retryGroupTraceDerivedState.filteredEvents;
  const retryGroupTraceReasonHashRecoverySummary =
    retryGroupTraceDerivedState.reasonHashRecoverySummary;
  const retryGroupTraceSloStatus = retryGroupTraceDerivedState.sloStatus;
  const retryGroupTraceSloDescription = retryGroupTraceDerivedState.sloDescription;
  const retryGroupTraceSummary = retryGroupTraceDerivedState.summary;
  const retryGroupTraceSource = retryGroupTraceDerivedState.source;

  const retryGroupTraceMarkdownText = useMemo(() => {
    return buildRetryGroupTraceMarkdownText({
      events: retryGroupTraceEvents,
      summary: retryGroupTraceSummary,
      reasonHashRecovery: retryGroupTraceReasonHashRecovery,
      retryGroupId: activeRetryGroupTraceId,
      channelMap: notificationChannelMap,
      generatedAtText: new Date().toLocaleString('zh-CN', { hour12: false }),
    });
  }, [
    activeRetryGroupTraceId,
    notificationChannelMap,
    retryGroupTraceEvents,
    retryGroupTraceReasonHashRecovery,
    retryGroupTraceSummary,
  ]);

  const openRetryGroupTraceModalById = useCallback(
    (retryGroupId: string) => {
      const normalized = retryGroupId.trim();
      if (!normalized) {
        message.info('当前记录没有 retryGroupId。');
        return;
      }

      openRetryGroupTraceState(normalized, {
        setActiveTab,
        setActiveRetryGroupTraceId,
        setRetryGroupTraceFilter,
        setRetryGroupTraceReasonHashFocus,
        setRetryGroupTraceModalOpen,
      });
    },
    [message, setActiveTab]
  );

  const closeRetryGroupTraceModal = useCallback(() => {
    setRetryGroupTraceModalOpen(false);
    setRetryGroupTraceFilter('all');
    setRetryGroupTraceReasonHashFocus('all');
  }, []);

  useEffect(() => {
    if (normalizedRetryGroupTraceReasonHashFocus === 'all') {
      return;
    }

    const stillExists = retryGroupTraceReasonHashRecovery.some(
      (item) => item.reasonHashKey === normalizedRetryGroupTraceReasonHashFocus
    );
    if (!stillExists) {
      setRetryGroupTraceReasonHashFocus('all');
    }
  }, [normalizedRetryGroupTraceReasonHashFocus, retryGroupTraceReasonHashRecovery]);

  const exportRetryGroupTraceCsv = useCallback(async () => {
    await exportDataOpsRetryGroupTraceCsv({
      activeRetryGroupTraceId,
      retryGroupTraceEvents,
      notificationChannelMap,
      exportCsv,
      info: message.info,
    });
  }, [
    activeRetryGroupTraceId,
    exportCsv,
    message,
    notificationChannelMap,
    retryGroupTraceEvents,
  ]);

  const copyRetryGroupTraceMarkdown = useCallback(async () => {
    await copyDataOpsNormalizedText({
      text: retryGroupTraceMarkdownText,
      copy: copyText,
      label: '重发链路Markdown报告',
      onEmpty: () => message.info('当前没有可复制的重发链路报告。'),
    });
  }, [copyText, message, retryGroupTraceMarkdownText]);

  const copyRetryGroupTraceLink = useCallback(async (options: {
    currentSearchParams: URLSearchParams;
    pathname: string;
  }) => {
    await copyRetryGroupTraceShareLink({
      activeRetryGroupTraceId,
      currentSearchParams: options.currentSearchParams,
      pathname: options.pathname,
      currentNotifyShareFilters: getCurrentNotifyShareFilters(),
      copyTextToClipboard: copyText,
      onMissingRetryGroupId: () => message.info('当前链路缺少 retryGroupId，无法复制链接。'),
    });
  }, [
    activeRetryGroupTraceId,
    copyText,
    getCurrentNotifyShareFilters,
    message,
  ]);

  const applyRetryGroupTraceAsNotifyFilter = useCallback(() => {
    applyRetryGroupTraceNotifyFilterState({
      activeRetryGroupTraceId,
      setNotifyRetryGroupIdFilter,
      setRetryGroupTraceModalOpen,
    });
  }, [activeRetryGroupTraceId, setNotifyRetryGroupIdFilter]);

  const focusRetryGroupTraceByReasonHash = useCallback((reasonHashKey: string) => {
    focusRetryGroupTraceReasonHashState({
      reasonHashKey,
      setRetryGroupTraceReasonHashFocus,
      setRetryGroupTraceFilter,
    });
  }, []);

  const clearRetryGroupTraceReasonHashFocus = useCallback(() => {
    clearRetryGroupTraceReasonHashFocusState({
      setRetryGroupTraceReasonHashFocus,
    });
  }, []);

  const retryGroupTraceDesktopColumns: ColumnsType<DataOpsNotificationEvent> = useMemo(
    () => buildDataOpsRetryGroupTraceColumns({ notificationChannelMap }),
    [notificationChannelMap]
  );
  const retryGroupTraceMobileColumns: ColumnsType<DataOpsNotificationEvent> = useMemo(
    () => buildDataOpsRetryGroupTraceMobileColumns({ notificationChannelMap }),
    [notificationChannelMap]
  );

  return {
    retryGroupTraceModalOpen,
    setRetryGroupTraceModalOpen,
    activeRetryGroupTraceId,
    setActiveRetryGroupTraceId,
    pendingRetryGroupTraceIdFromUrl,
    setPendingRetryGroupTraceIdFromUrl,
    retryGroupTraceFilter,
    setRetryGroupTraceFilter,
    retryGroupTraceReasonHashFocus,
    setRetryGroupTraceReasonHashFocus,
    retryGroupTraceEvents,
    retryGroupTraceFailedEvents,
    retryGroupTraceRetryableFailedEvents,
    retryGroupTraceReasonHashRecovery,
    retryGroupTraceReasonHashFocusLabel,
    filteredRetryGroupTraceEvents,
    retryGroupTraceReasonHashRecoverySummary,
    retryGroupTraceSloStatus,
    retryGroupTraceSloDescription,
    retryGroupTraceSummary,
    retryGroupTraceSource,
    retryGroupTraceMarkdownText,
    normalizedRetryGroupTraceReasonHashFocus,
    retryGroupTraceIsFetching: retryGroupTraceQuery.isFetching,
    retryGroupTraceErrorMessage: retryGroupTraceQuery.isError
      ? getActionErrorMessage(retryGroupTraceQuery.error)
      : null,
    retryGroupTraceColumns: isCompactViewport
      ? retryGroupTraceMobileColumns
      : retryGroupTraceDesktopColumns,
    openRetryGroupTraceModalById,
    closeRetryGroupTraceModal,
    focusRetryGroupTraceByReasonHash,
    exportRetryGroupTraceCsv,
    copyRetryGroupTraceMarkdown,
    copyRetryGroupTraceLink,
    applyRetryGroupTraceAsNotifyFilter,
    clearRetryGroupTraceReasonHashFocus,
  };
}
