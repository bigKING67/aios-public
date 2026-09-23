import {
  BATCH_HISTORY_ACTION_FILTER_VALUES,
  BATCH_HISTORY_FAILURE_FILTER_VALUES,
  BATCH_HISTORY_TIME_RANGE_FILTER_VALUES,
  NOTIFICATION_STATUS_FILTER_VALUES,
  TAB_FILTER_VALUES,
} from './dataops-hub-constants';
import type {
  BatchHistoryFailureFilter,
  BatchHistoryTimeRangeFilter,
  BatchOperationAction,
  NotificationStatusFilter,
  TabKey,
} from './dataops-hub-types';

export function isTabFilterValue(value: string | null): value is TabKey {
  if (!value) {
    return false;
  }
  return TAB_FILTER_VALUES.has(value as TabKey);
}

export function isBatchHistoryActionFilterValue(
  value: string | null
): value is BatchOperationAction | 'all' {
  if (!value) {
    return false;
  }
  return BATCH_HISTORY_ACTION_FILTER_VALUES.has(value as BatchOperationAction | 'all');
}

export function isBatchHistoryFailureFilterValue(
  value: string | null
): value is BatchHistoryFailureFilter {
  if (!value) {
    return false;
  }
  return BATCH_HISTORY_FAILURE_FILTER_VALUES.has(value);
}

export function isBatchHistoryTimeRangeFilterValue(
  value: string | null
): value is BatchHistoryTimeRangeFilter {
  if (!value) {
    return false;
  }
  return BATCH_HISTORY_TIME_RANGE_FILTER_VALUES.has(value);
}

export function isNotificationStatusFilterValue(
  value: string | null
): value is NotificationStatusFilter {
  if (!value) {
    return false;
  }
  return NOTIFICATION_STATUS_FILTER_VALUES.has(value);
}
