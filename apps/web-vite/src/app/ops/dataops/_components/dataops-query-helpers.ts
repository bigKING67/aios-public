import {
  BATCH_HISTORY_QUERY_KEYS,
  isBatchHistoryActionFilterValue,
  isBatchHistoryFailureFilterValue,
  isBatchHistoryTimeRangeFilterValue,
  isNotificationStatusFilterValue,
  isTabFilterValue,
  type BatchHistoryFailureFilter,
  type BatchHistoryTimeRangeFilter,
  type BatchOperationAction,
  type NotificationStatusFilter,
  type TabKey,
} from './dataops-hub-formatters';

export interface DataOpsUrlHydrationState {
  tab?: TabKey;
  shouldOpenBatchHistory: boolean;
  batchHistoryActionFilter?: BatchOperationAction | 'all';
  batchHistoryFailureFilter?: BatchHistoryFailureFilter;
  batchHistoryTimeRangeFilter?: BatchHistoryTimeRangeFilter;
  batchHistoryKeyword: string;
  notifyChannel: string;
  notifyEventType: string;
  notifyStatus?: NotificationStatusFilter;
  notifyFailureChannelFocus: string;
  notifyFailureReason: string;
  notifyReasonHash: string;
  notifyRetryGroupId: string;
  notifyTraceGroup: string;
}

export interface DataOpsNotifyFilterState {
  channelFilter: string;
  notificationEventTypeFilter: string;
  notificationStatusFilter: NotificationStatusFilter;
  notifyFailureChannelFocus: string;
  selectedNotifyFailureReason: string;
  notifyReasonHashFilter: string;
  notifyRetryGroupIdFilter: string;
}

export interface DataOpsUrlSyncState {
  activeTab: TabKey;
  batchHistoryModalOpen: boolean;
  batchHistoryActionFilter: BatchOperationAction | 'all';
  batchHistoryFailureFilter: BatchHistoryFailureFilter;
  batchHistoryTimeRangeFilter: BatchHistoryTimeRangeFilter;
  batchHistoryKeyword: string;
  retryGroupTraceModalOpen: boolean;
  activeRetryGroupTraceId: string;
  notifyFilters: DataOpsNotifyFilterState;
}

function syncOptionalParam(params: URLSearchParams, key: string, value: string): void {
  const normalized = value.trim();
  if (normalized) {
    params.set(key, normalized);
  } else {
    params.delete(key);
  }
}

function syncOptionalNonAllParam(params: URLSearchParams, key: string, value: string): void {
  const normalized = value.trim();
  if (normalized && normalized !== 'all') {
    params.set(key, normalized);
  } else {
    params.delete(key);
  }
}

export function parseDataOpsUrlHydrationState(
  searchParams: URLSearchParams
): DataOpsUrlHydrationState {
  const tabParam = searchParams.get(BATCH_HISTORY_QUERY_KEYS.tab);
  const actionFilterParam = searchParams.get(BATCH_HISTORY_QUERY_KEYS.action);
  const failureFilterParam = searchParams.get(BATCH_HISTORY_QUERY_KEYS.failure);
  const timeRangeFilterParam = searchParams.get(BATCH_HISTORY_QUERY_KEYS.range);
  const notifyStatusParam = searchParams.get(BATCH_HISTORY_QUERY_KEYS.notifyStatus);

  return {
    tab: isTabFilterValue(tabParam) ? tabParam : undefined,
    shouldOpenBatchHistory: searchParams.get(BATCH_HISTORY_QUERY_KEYS.open) === '1',
    batchHistoryActionFilter: isBatchHistoryActionFilterValue(actionFilterParam)
      ? actionFilterParam
      : undefined,
    batchHistoryFailureFilter: isBatchHistoryFailureFilterValue(failureFilterParam)
      ? failureFilterParam
      : undefined,
    batchHistoryTimeRangeFilter: isBatchHistoryTimeRangeFilterValue(timeRangeFilterParam)
      ? timeRangeFilterParam
      : undefined,
    batchHistoryKeyword: searchParams.get(BATCH_HISTORY_QUERY_KEYS.keyword) || '',
    notifyChannel: searchParams.get(BATCH_HISTORY_QUERY_KEYS.notifyChannel) || '',
    notifyEventType: searchParams.get(BATCH_HISTORY_QUERY_KEYS.notifyEventType) || '',
    notifyStatus: isNotificationStatusFilterValue(notifyStatusParam)
      ? notifyStatusParam
      : undefined,
    notifyFailureChannelFocus:
      searchParams.get(BATCH_HISTORY_QUERY_KEYS.notifyFailureChannelFocus) || '',
    notifyFailureReason: searchParams.get(BATCH_HISTORY_QUERY_KEYS.notifyFailureReason) || '',
    notifyReasonHash: searchParams.get(BATCH_HISTORY_QUERY_KEYS.notifyReasonHash) || '',
    notifyRetryGroupId: searchParams.get(BATCH_HISTORY_QUERY_KEYS.notifyRetryGroupId) || '',
    notifyTraceGroup: searchParams.get(BATCH_HISTORY_QUERY_KEYS.notifyTraceGroup) || '',
  };
}

export function applyNotifyFilterParamsToQuery(
  params: URLSearchParams,
  filters: DataOpsNotifyFilterState
): void {
  syncOptionalNonAllParam(params, BATCH_HISTORY_QUERY_KEYS.notifyChannel, filters.channelFilter);
  syncOptionalNonAllParam(
    params,
    BATCH_HISTORY_QUERY_KEYS.notifyEventType,
    filters.notificationEventTypeFilter
  );

  if (filters.notificationStatusFilter !== 'all') {
    params.set(BATCH_HISTORY_QUERY_KEYS.notifyStatus, filters.notificationStatusFilter);
  } else {
    params.delete(BATCH_HISTORY_QUERY_KEYS.notifyStatus);
  }

  syncOptionalNonAllParam(
    params,
    BATCH_HISTORY_QUERY_KEYS.notifyFailureChannelFocus,
    filters.notifyFailureChannelFocus
  );
  syncOptionalParam(
    params,
    BATCH_HISTORY_QUERY_KEYS.notifyFailureReason,
    filters.selectedNotifyFailureReason
  );
  syncOptionalParam(
    params,
    BATCH_HISTORY_QUERY_KEYS.notifyReasonHash,
    filters.notifyReasonHashFilter.toLowerCase()
  );
  syncOptionalParam(
    params,
    BATCH_HISTORY_QUERY_KEYS.notifyRetryGroupId,
    filters.notifyRetryGroupIdFilter
  );
}

export function buildDataOpsNotifyShareUrl(options: {
  currentSearchParams: URLSearchParams;
  pathname: string;
  filters: DataOpsNotifyFilterState;
  retryGroupId?: string;
  origin?: string;
}): string {
  const nextParams = new URLSearchParams(options.currentSearchParams.toString());
  nextParams.set(BATCH_HISTORY_QUERY_KEYS.tab, 'notify');
  applyNotifyFilterParamsToQuery(nextParams, options.filters);

  const normalizedRetryGroupId = options.retryGroupId?.trim();
  if (normalizedRetryGroupId) {
    nextParams.set(BATCH_HISTORY_QUERY_KEYS.notifyTraceGroup, normalizedRetryGroupId);
  } else {
    nextParams.delete(BATCH_HISTORY_QUERY_KEYS.notifyTraceGroup);
  }

  const nextQuery = nextParams.toString();
  const relativeUrl = nextQuery ? `${options.pathname}?${nextQuery}` : options.pathname;
  return options.origin ? `${options.origin}${relativeUrl}` : relativeUrl;
}

function clearNotifyFilterParams(params: URLSearchParams): void {
  params.delete(BATCH_HISTORY_QUERY_KEYS.notifyChannel);
  params.delete(BATCH_HISTORY_QUERY_KEYS.notifyEventType);
  params.delete(BATCH_HISTORY_QUERY_KEYS.notifyStatus);
  params.delete(BATCH_HISTORY_QUERY_KEYS.notifyFailureChannelFocus);
  params.delete(BATCH_HISTORY_QUERY_KEYS.notifyFailureReason);
  params.delete(BATCH_HISTORY_QUERY_KEYS.notifyReasonHash);
  params.delete(BATCH_HISTORY_QUERY_KEYS.notifyRetryGroupId);
  params.delete(BATCH_HISTORY_QUERY_KEYS.notifyTraceGroup);
}

export function buildDataOpsSyncedSearchParams(
  currentSearchParams: URLSearchParams,
  state: DataOpsUrlSyncState
): URLSearchParams {
  const nextParams = new URLSearchParams(currentSearchParams.toString());

  if (state.activeTab !== 'orchestration') {
    nextParams.set(BATCH_HISTORY_QUERY_KEYS.tab, state.activeTab);
  } else {
    nextParams.delete(BATCH_HISTORY_QUERY_KEYS.tab);
  }

  if (state.batchHistoryModalOpen) {
    nextParams.set(BATCH_HISTORY_QUERY_KEYS.open, '1');
    syncOptionalNonAllParam(
      nextParams,
      BATCH_HISTORY_QUERY_KEYS.action,
      state.batchHistoryActionFilter
    );
    syncOptionalNonAllParam(
      nextParams,
      BATCH_HISTORY_QUERY_KEYS.failure,
      state.batchHistoryFailureFilter
    );
    syncOptionalNonAllParam(
      nextParams,
      BATCH_HISTORY_QUERY_KEYS.range,
      state.batchHistoryTimeRangeFilter
    );
    syncOptionalParam(nextParams, BATCH_HISTORY_QUERY_KEYS.keyword, state.batchHistoryKeyword);
  } else {
    nextParams.delete(BATCH_HISTORY_QUERY_KEYS.open);
    nextParams.delete(BATCH_HISTORY_QUERY_KEYS.action);
    nextParams.delete(BATCH_HISTORY_QUERY_KEYS.failure);
    nextParams.delete(BATCH_HISTORY_QUERY_KEYS.range);
    nextParams.delete(BATCH_HISTORY_QUERY_KEYS.keyword);
  }

  if (state.activeTab === 'notify') {
    applyNotifyFilterParamsToQuery(nextParams, state.notifyFilters);
    const normalizedTraceGroupId = state.activeRetryGroupTraceId.trim();
    if (state.retryGroupTraceModalOpen && normalizedTraceGroupId) {
      nextParams.set(BATCH_HISTORY_QUERY_KEYS.notifyTraceGroup, normalizedTraceGroupId);
    } else {
      nextParams.delete(BATCH_HISTORY_QUERY_KEYS.notifyTraceGroup);
    }
  } else {
    clearNotifyFilterParams(nextParams);
  }

  return nextParams;
}
