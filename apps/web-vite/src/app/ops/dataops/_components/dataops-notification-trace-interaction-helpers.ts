import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import {
  formatTokenPreview,
  normalizeToken,
  type NotificationTraceFilter,
} from './dataops-hub-formatters';
import {
  buildDataOpsCsvFileName,
  type DataOpsCsvCell,
} from './dataops-export-helpers';
import {
  buildNotificationRetryGroupTraceCsvRows,
  NOTIFICATION_RETRY_GROUP_TRACE_CSV_HEADERS,
} from './dataops-notification-retry-helpers';
import { copyDataOpsNotifyShareUrl } from './dataops-notify-share-helpers';
import type { DataOpsNotifyFilterState } from './dataops-query-helpers';

type StringSetter = (value: string) => void;
type BooleanSetter = (value: boolean) => void;
type NotificationTraceFilterSetter = (value: NotificationTraceFilter) => void;
type ChannelNameMap = Map<string, { channelName: string }>;

export interface RetryGroupTraceCsvExportPayload {
  headers: string[];
  rows: DataOpsCsvCell[][];
  fileName: string;
  downloadSuccessText: string;
  clipboardSuccessText: string;
}

export interface RetryGroupTraceOpenState {
  activeTab: 'notify';
  activeRetryGroupTraceId: string;
  retryGroupTraceFilter: NotificationTraceFilter;
  retryGroupTraceReasonHashFocus: string;
  retryGroupTraceModalOpen: boolean;
}

function buildRetryGroupTraceCsvPrefix(activeRetryGroupTraceId: string): string {
  const suffix = formatTokenPreview(activeRetryGroupTraceId, 14).replace(/[^\w.-]/g, '_');
  return `dataops-notification-retry-group-${suffix}`;
}

export function buildRetryGroupTraceCsvFileName(activeRetryGroupTraceId: string): string {
  return buildDataOpsCsvFileName(buildRetryGroupTraceCsvPrefix(activeRetryGroupTraceId));
}

export function buildRetryGroupTraceCsvExportPayload(options: {
  activeRetryGroupTraceId: string;
  retryGroupTraceEvents: DataOpsNotificationEvent[];
  notificationChannelMap: ChannelNameMap;
}): RetryGroupTraceCsvExportPayload {
  const rows = buildNotificationRetryGroupTraceCsvRows(
    options.retryGroupTraceEvents,
    options.notificationChannelMap
  );
  const fileName = buildRetryGroupTraceCsvFileName(options.activeRetryGroupTraceId);

  return {
    headers: NOTIFICATION_RETRY_GROUP_TRACE_CSV_HEADERS,
    rows,
    fileName,
    downloadSuccessText: `已导出 ${rows.length} 条重发链路事件到 ${fileName}`,
    clipboardSuccessText: '重发链路CSV已复制',
  };
}

export function buildRetryGroupTraceOpenState(
  retryGroupId: string
): RetryGroupTraceOpenState | null {
  const normalized = retryGroupId.trim();
  if (!normalized) {
    return null;
  }

  return {
    activeTab: 'notify',
    activeRetryGroupTraceId: normalized,
    retryGroupTraceFilter: 'all',
    retryGroupTraceReasonHashFocus: 'all',
    retryGroupTraceModalOpen: true,
  };
}

export interface RetryGroupTraceOpenStateSetters {
  setActiveTab: (value: 'notify') => void;
  setActiveRetryGroupTraceId: StringSetter;
  setRetryGroupTraceFilter: NotificationTraceFilterSetter;
  setRetryGroupTraceReasonHashFocus: StringSetter;
  setRetryGroupTraceModalOpen: BooleanSetter;
}

export function applyRetryGroupTraceOpenState(options: RetryGroupTraceOpenStateSetters & {
  state: RetryGroupTraceOpenState;
}): void {
  options.setActiveTab(options.state.activeTab);
  options.setActiveRetryGroupTraceId(options.state.activeRetryGroupTraceId);
  options.setRetryGroupTraceFilter(options.state.retryGroupTraceFilter);
  options.setRetryGroupTraceReasonHashFocus(options.state.retryGroupTraceReasonHashFocus);
  options.setRetryGroupTraceModalOpen(options.state.retryGroupTraceModalOpen);
}

export function openRetryGroupTraceState(
  retryGroupId: string,
  setters: RetryGroupTraceOpenStateSetters
): boolean {
  const nextState = buildRetryGroupTraceOpenState(retryGroupId);
  if (!nextState) {
    return false;
  }

  applyRetryGroupTraceOpenState({
    state: nextState,
    ...setters,
  });
  return true;
}

export function applyRetryGroupTraceNotifyFilterState(options: {
  activeRetryGroupTraceId: string;
  setNotifyRetryGroupIdFilter: StringSetter;
  setRetryGroupTraceModalOpen: BooleanSetter;
}): boolean {
  const retryGroupId = options.activeRetryGroupTraceId.trim();
  if (!retryGroupId) {
    return false;
  }

  options.setNotifyRetryGroupIdFilter(retryGroupId);
  options.setRetryGroupTraceModalOpen(false);
  return true;
}

export function focusRetryGroupTraceReasonHashState(options: {
  reasonHashKey: string;
  setRetryGroupTraceReasonHashFocus: StringSetter;
  setRetryGroupTraceFilter: NotificationTraceFilterSetter;
}): void {
  const normalized = normalizeToken(options.reasonHashKey);
  if (!normalized) {
    options.setRetryGroupTraceReasonHashFocus('all');
    return;
  }

  options.setRetryGroupTraceReasonHashFocus(normalized);
  options.setRetryGroupTraceFilter('all');
}

export function clearRetryGroupTraceReasonHashFocusState(options: {
  setRetryGroupTraceReasonHashFocus: StringSetter;
}): void {
  options.setRetryGroupTraceReasonHashFocus('all');
}

export async function copyRetryGroupTraceShareLink(options: {
  activeRetryGroupTraceId: string;
  currentSearchParams: URLSearchParams;
  pathname: string;
  currentNotifyShareFilters: DataOpsNotifyFilterState;
  copyTextToClipboard: (text: string, label: string) => Promise<void>;
  onMissingRetryGroupId: () => void;
}): Promise<void> {
  const retryGroupId = options.activeRetryGroupTraceId.trim();
  if (!retryGroupId) {
    options.onMissingRetryGroupId();
    return;
  }

  await copyDataOpsNotifyShareUrl({
    currentSearchParams: options.currentSearchParams,
    pathname: options.pathname,
    filters: options.currentNotifyShareFilters,
    copyText: options.copyTextToClipboard,
    label: '链路分享链接',
    retryGroupId,
  });
}
