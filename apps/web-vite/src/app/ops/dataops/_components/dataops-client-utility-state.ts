import { useCallback, useMemo } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import {
  normalizeText,
  normalizeToken,
  type NotificationStatusFilter,
} from './dataops-hub-formatters';
import { createDataOpsFeedbackActions } from './dataops-feedback-actions';

export function useDataOpsClientUtilityState(options: {
  channelFilter: string;
  keywordInput: string;
  message: MessageInstance;
  notificationEventTypeFilter: string;
  notificationStatusFilter: NotificationStatusFilter;
  notifyFailureChannelFocus: string;
  notifyReasonHashFilter: string;
  notifyRetryGroupIdFilter: string;
  selectedNotifyFailureReason: string;
}) {
  const {
    channelFilter,
    keywordInput,
    message,
    notificationEventTypeFilter,
    notificationStatusFilter,
    notifyFailureChannelFocus,
    notifyReasonHashFilter,
    notifyRetryGroupIdFilter,
    selectedNotifyFailureReason,
  } = options;

  const normalizedKeyword = useMemo(
    () => normalizeText(keywordInput),
    [keywordInput]
  );
  const normalizedNotifyReasonHashFilter = useMemo(
    () => normalizeToken(notifyReasonHashFilter),
    [notifyReasonHashFilter]
  );
  const normalizedNotifyRetryGroupIdFilter = useMemo(
    () => normalizeToken(notifyRetryGroupIdFilter),
    [notifyRetryGroupIdFilter]
  );
  const { copyTextToClipboard, exportDataOpsCsv } = useMemo(
    () => createDataOpsFeedbackActions(message),
    [message]
  );

  const getCurrentNotifyShareFilters = useCallback(
    () => ({
      channelFilter,
      notificationEventTypeFilter,
      notificationStatusFilter,
      notifyFailureChannelFocus,
      selectedNotifyFailureReason,
      notifyReasonHashFilter,
      notifyRetryGroupIdFilter,
    }),
    [
      channelFilter,
      notificationEventTypeFilter,
      notificationStatusFilter,
      notifyFailureChannelFocus,
      notifyReasonHashFilter,
      notifyRetryGroupIdFilter,
      selectedNotifyFailureReason,
    ]
  );

  const currentNotifyShareFilters = useMemo(
    () => ({
      channelFilter,
      notificationEventTypeFilter,
      notificationStatusFilter,
      notifyFailureChannelFocus,
      selectedNotifyFailureReason,
      notifyReasonHashFilter,
      notifyRetryGroupIdFilter,
    }),
    [
      channelFilter,
      notificationEventTypeFilter,
      notificationStatusFilter,
      notifyFailureChannelFocus,
      notifyReasonHashFilter,
      notifyRetryGroupIdFilter,
      selectedNotifyFailureReason,
    ]
  );

  return {
    copyTextToClipboard,
    currentNotifyShareFilters,
    exportDataOpsCsv,
    getCurrentNotifyShareFilters,
    normalizedKeyword,
    normalizedNotifyReasonHashFilter,
    normalizedNotifyRetryGroupIdFilter,
  };
}
