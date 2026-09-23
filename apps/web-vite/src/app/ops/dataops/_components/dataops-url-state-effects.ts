import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import {
  normalizeToken,
  type BatchHistoryFailureFilter,
  type BatchHistoryTimeRangeFilter,
  type BatchOperationAction,
  type NotificationStatusFilter,
  type NotificationTraceFilter,
  type TabKey,
} from './dataops-hub-formatters';
import {
  buildDataOpsSyncedSearchParams,
  parseDataOpsUrlHydrationState,
} from './dataops-query-helpers';
import { openRetryGroupTraceState } from './dataops-notification-trace-interaction-helpers';

type StringSetter = (value: string) => void;
type BooleanSetter = (value: boolean) => void;
type TabSetter = (value: TabKey) => void;

export type DataOpsUrlStateEffectsOptions = {
  activeTab: TabKey;
  batchHistoryModalOpen: boolean;
  batchHistoryActionFilter: BatchOperationAction | 'all';
  batchHistoryFailureFilter: BatchHistoryFailureFilter;
  batchHistoryTimeRangeFilter: BatchHistoryTimeRangeFilter;
  batchHistoryKeyword: string;
  retryGroupTraceModalOpen: boolean;
  activeRetryGroupTraceId: string;
  channelFilter: string;
  notificationEventTypeFilter: string;
  notificationStatusFilter: NotificationStatusFilter;
  notifyFailureChannelFocus: string;
  selectedNotifyFailureReason: string;
  notifyReasonHashFilter: string;
  notifyRetryGroupIdFilter: string;
  pendingRetryGroupTraceIdFromUrl: string;
  setActiveTab: TabSetter;
  setBatchHistoryModalOpen: BooleanSetter;
  setBatchHistoryActionFilter: (value: BatchOperationAction | 'all') => void;
  setBatchHistoryFailureFilter: (value: BatchHistoryFailureFilter) => void;
  setBatchHistoryTimeRangeFilter: (value: BatchHistoryTimeRangeFilter) => void;
  setBatchHistoryKeyword: StringSetter;
  setChannelFilter: StringSetter;
  setNotificationEventTypeFilter: StringSetter;
  setNotificationStatusFilter: (value: NotificationStatusFilter) => void;
  setNotifyFailureChannelFocus: StringSetter;
  setSelectedNotifyFailureReason: StringSetter;
  setNotifyReasonHashFilter: StringSetter;
  setNotifyRetryGroupIdFilter: StringSetter;
  setPendingRetryGroupTraceIdFromUrl: StringSetter;
  setActiveRetryGroupTraceId: StringSetter;
  setRetryGroupTraceFilter: (value: NotificationTraceFilter) => void;
  setRetryGroupTraceReasonHashFocus: StringSetter;
  setRetryGroupTraceModalOpen: BooleanSetter;
};

export function useDataOpsUrlStateEffects(options: DataOpsUrlStateEffectsOptions) {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const [searchParams] = useSearchParams();
  const hasHydratedUrlStateRef = useRef(false);
  const {
    pendingRetryGroupTraceIdFromUrl,
    setActiveRetryGroupTraceId,
    setActiveTab,
    setPendingRetryGroupTraceIdFromUrl,
    setRetryGroupTraceFilter,
    setRetryGroupTraceModalOpen,
    setRetryGroupTraceReasonHashFocus,
  } = options;

  useEffect(() => {
    if (hasHydratedUrlStateRef.current) {
      return;
    }

    const hydratedState = parseDataOpsUrlHydrationState(searchParams);

    if (hydratedState.tab) {
      options.setActiveTab(hydratedState.tab);
    }
    if (hydratedState.batchHistoryActionFilter) {
      options.setBatchHistoryActionFilter(hydratedState.batchHistoryActionFilter);
    }
    if (hydratedState.batchHistoryFailureFilter) {
      options.setBatchHistoryFailureFilter(hydratedState.batchHistoryFailureFilter);
    }
    if (hydratedState.batchHistoryTimeRangeFilter) {
      options.setBatchHistoryTimeRangeFilter(hydratedState.batchHistoryTimeRangeFilter);
    }
    if (hydratedState.batchHistoryKeyword) {
      options.setBatchHistoryKeyword(hydratedState.batchHistoryKeyword);
    }
    if (hydratedState.notifyChannel) {
      options.setChannelFilter(hydratedState.notifyChannel);
    }
    if (hydratedState.notifyEventType) {
      options.setNotificationEventTypeFilter(hydratedState.notifyEventType);
    }
    if (hydratedState.notifyStatus) {
      options.setNotificationStatusFilter(hydratedState.notifyStatus);
    }
    if (hydratedState.notifyFailureChannelFocus) {
      options.setNotifyFailureChannelFocus(hydratedState.notifyFailureChannelFocus);
    }
    if (hydratedState.notifyFailureReason) {
      options.setSelectedNotifyFailureReason(hydratedState.notifyFailureReason);
    }
    if (hydratedState.notifyReasonHash) {
      options.setNotifyReasonHashFilter(hydratedState.notifyReasonHash.toLowerCase());
    }
    if (hydratedState.notifyRetryGroupId) {
      options.setNotifyRetryGroupIdFilter(hydratedState.notifyRetryGroupId);
    }
    if (hydratedState.notifyTraceGroup) {
      options.setActiveTab('notify');
      options.setPendingRetryGroupTraceIdFromUrl(hydratedState.notifyTraceGroup);
    }

    if (hydratedState.shouldOpenBatchHistory) {
      options.setBatchHistoryModalOpen(true);
    }

    hasHydratedUrlStateRef.current = true;
  }, [options, searchParams]);

  useEffect(() => {
    const traceGroupId = pendingRetryGroupTraceIdFromUrl.trim();
    if (!traceGroupId) {
      return;
    }

    const normalizedTraceGroupId = normalizeToken(traceGroupId);
    if (!normalizedTraceGroupId) {
      setPendingRetryGroupTraceIdFromUrl('');
      return;
    }

    openRetryGroupTraceState(traceGroupId, {
      setActiveTab,
      setActiveRetryGroupTraceId,
      setRetryGroupTraceFilter,
      setRetryGroupTraceReasonHashFocus,
      setRetryGroupTraceModalOpen,
    });
    setPendingRetryGroupTraceIdFromUrl('');
  }, [
    pendingRetryGroupTraceIdFromUrl,
    setActiveRetryGroupTraceId,
    setActiveTab,
    setPendingRetryGroupTraceIdFromUrl,
    setRetryGroupTraceFilter,
    setRetryGroupTraceModalOpen,
    setRetryGroupTraceReasonHashFocus,
  ]);

  useEffect(() => {
    if (!hasHydratedUrlStateRef.current) {
      return;
    }

    const nextParams = buildDataOpsSyncedSearchParams(searchParams, {
      activeTab: options.activeTab,
      batchHistoryModalOpen: options.batchHistoryModalOpen,
      batchHistoryActionFilter: options.batchHistoryActionFilter,
      batchHistoryFailureFilter: options.batchHistoryFailureFilter,
      batchHistoryTimeRangeFilter: options.batchHistoryTimeRangeFilter,
      batchHistoryKeyword: options.batchHistoryKeyword,
      retryGroupTraceModalOpen: options.retryGroupTraceModalOpen,
      activeRetryGroupTraceId: options.activeRetryGroupTraceId,
      notifyFilters: {
        channelFilter: options.channelFilter,
        notificationEventTypeFilter: options.notificationEventTypeFilter,
        notificationStatusFilter: options.notificationStatusFilter,
        notifyFailureChannelFocus: options.notifyFailureChannelFocus,
        selectedNotifyFailureReason: options.selectedNotifyFailureReason,
        notifyReasonHashFilter: options.notifyReasonHashFilter,
        notifyRetryGroupIdFilter: options.notifyRetryGroupIdFilter,
      },
    });

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) {
      return;
    }

    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    navigate(nextUrl, { replace: true });
  }, [
    options.activeRetryGroupTraceId,
    options.activeTab,
    options.batchHistoryActionFilter,
    options.batchHistoryFailureFilter,
    options.batchHistoryKeyword,
    options.batchHistoryModalOpen,
    options.batchHistoryTimeRangeFilter,
    options.channelFilter,
    options.notificationEventTypeFilter,
    options.notificationStatusFilter,
    options.notifyFailureChannelFocus,
    options.notifyReasonHashFilter,
    options.notifyRetryGroupIdFilter,
    options.retryGroupTraceModalOpen,
    options.selectedNotifyFailureReason,
    navigate,
    pathname,
    searchParams,
  ]);

  return {
    pathname,
    searchParams,
  };
}
