import type { DataOpsNotificationChannel, DataOpsNotificationEvent } from '@/config/dataops-hub';
import type {
  DataOpsNotificationTraceResponse,
  DataOpsNotificationTraceSloStatus,
} from '@/types/dataops';
import {
  MISSING_REASON_HASH_KEY,
  getNotificationEventTypeLabel,
  normalizeToken,
  type NotificationTraceFilter,
} from './dataops-hub-formatters';
import type {
  DataOpsNotificationFailureDerivedState,
  DataOpsNotificationFilterLabels,
  DataOpsRetryGroupTraceDerivedState,
} from './dataops-hub-selector-types';
import {
  buildNotificationFailureStats,
  buildNotificationFailureSummary,
  buildNotificationTraceReasonHashRecovery,
  buildNotificationTraceReasonHashRecoverySummary,
  buildNotificationTraceSummary,
  filterNotificationEventsByFailureReason,
  filterNotificationTraceEvents,
  filterNotificationTraceEventsByRetryGroup,
  filterRetryableNotificationEvents,
} from './dataops-notification-retry-helpers';
import {
  buildNotificationFailureAlertTemplateText,
  buildNotificationFailureSummaryText,
  buildNotificationMarkdownText,
} from './dataops-report-helpers';

export function buildRetryGroupTraceSloDescription(
  sloStatus: DataOpsNotificationTraceSloStatus | null
): string {
  if (!sloStatus) {
    return '';
  }

  if (!sloStatus.enabled) {
    return 'SLO 监控已禁用，可通过 DATAOPS_NOTIFY_TRACE_SLO_ENABLED 控制。';
  }

  const header = `阈值：恢复率<${sloStatus.thresholdRecoveryRate}% 且 首次失败>=${sloStatus.minFirstFailedCount}，冷却=${sloStatus.cooldownMinutes} 分钟。`;
  if (!sloStatus.breached) {
    return header;
  }

  const itemLines = sloStatus.items.slice(0, 3).map((item) => {
    const statusText = item.triggered ? '已触发' : item.cooldownActive ? '冷却中' : '已命中';
    const reasonLabel =
      item.reasonHashKey === MISSING_REASON_HASH_KEY ? '缺失reasonHash' : item.reasonHashLabel;
    return `${reasonLabel}（恢复率 ${item.recoveryRate}% / 首次失败 ${item.firstFailedCount} / ${statusText}）`;
  });
  const warningText = sloStatus.warning ? `；告警：${sloStatus.warning}` : '';
  return `${header} 命中项：${itemLines.join('；') || '无'}${warningText}`;
}

export function buildDataOpsRetryGroupTraceDerivedState({
  notificationEvents,
  activeRetryGroupTraceId,
  serverTraceData,
  availableChannelIds,
  channelMap,
  normalizedReasonHashFocus,
  traceFilter,
}: {
  notificationEvents: DataOpsNotificationEvent[];
  activeRetryGroupTraceId: string;
  serverTraceData?: DataOpsNotificationTraceResponse;
  availableChannelIds: ReadonlySet<string>;
  channelMap: Map<string, DataOpsNotificationChannel>;
  normalizedReasonHashFocus: string;
  traceFilter: NotificationTraceFilter;
}): DataOpsRetryGroupTraceDerivedState {
  const targetRetryGroupId = normalizeToken(activeRetryGroupTraceId);
  const fallbackEvents = filterNotificationTraceEventsByRetryGroup(
    notificationEvents,
    activeRetryGroupTraceId
  );
  let events: DataOpsNotificationEvent[] = [];
  if (targetRetryGroupId) {
    const serverRetryGroupId = normalizeToken(serverTraceData?.retryGroupId || '');
    events =
      serverTraceData && serverRetryGroupId === targetRetryGroupId
        ? serverTraceData.events
        : fallbackEvents;
  }

  const failedEvents = events.filter((item) => item.status === 'failed');
  const retryableFailedEvents = filterRetryableNotificationEvents(failedEvents, availableChannelIds);
  const fallbackReasonHashRecovery = buildNotificationTraceReasonHashRecovery(events);
  const reasonHashRecovery = serverTraceData?.reasonHashRecovery || fallbackReasonHashRecovery;
  const reasonHashLabelMap = new Map(
    reasonHashRecovery.map((item) => [item.reasonHashKey, item.reasonHashLabel])
  );
  const reasonHashFocusLabel = (() => {
    if (normalizedReasonHashFocus === 'all') {
      return '全部reasonHash';
    }
    if (normalizedReasonHashFocus === MISSING_REASON_HASH_KEY) {
      return '缺失reasonHash';
    }
    return reasonHashLabelMap.get(normalizedReasonHashFocus) || normalizedReasonHashFocus;
  })();
  const reasonHashFocusGroupSet = (() => {
    if (normalizedReasonHashFocus === 'all') {
      return null;
    }

    const target = reasonHashRecovery.find(
      (item) => item.reasonHashKey === normalizedReasonHashFocus
    );
    return target ? new Set(target.traceGroupKeys) : null;
  })();
  const filteredEvents = filterNotificationTraceEvents({
    events,
    failedEvents,
    retryableFailedEvents,
    traceFilter,
    focusGroupSet: reasonHashFocusGroupSet,
  });
  const summaryFallback = buildNotificationTraceSummary(events, {
    availableChannelIds,
    channelMap,
  });
  const sloStatus = serverTraceData?.slo || null;

  return {
    events,
    failedEvents,
    retryableFailedEvents,
    reasonHashRecovery,
    reasonHashFocusLabel,
    filteredEvents,
    reasonHashRecoverySummary: buildNotificationTraceReasonHashRecoverySummary(reasonHashRecovery),
    sloStatus,
    sloDescription: buildRetryGroupTraceSloDescription(sloStatus),
    summary: serverTraceData?.summary || summaryFallback,
    source: serverTraceData?.source || null,
  };
}

export function buildDataOpsNotificationFilterLabels({
  channelFilter,
  eventTypeFilter,
  statusLabel,
  notifyFailureChannelFocus,
  selectedFailureReason,
  normalizedReasonHashFilter,
  normalizedRetryGroupIdFilter,
  keyword,
  channelMap,
}: {
  channelFilter: string;
  eventTypeFilter: string;
  statusLabel: string;
  notifyFailureChannelFocus: string;
  selectedFailureReason: string;
  normalizedReasonHashFilter: string;
  normalizedRetryGroupIdFilter: string;
  keyword: string;
  channelMap: Map<string, DataOpsNotificationChannel>;
}): DataOpsNotificationFilterLabels {
  const channelLabel =
    channelFilter === 'all' ? '全部通道' : channelMap.get(channelFilter)?.channelName || channelFilter;
  const eventTypeLabel =
    eventTypeFilter === 'all' ? '全部事件' : getNotificationEventTypeLabel(eventTypeFilter);
  const focusedFailureChannelLabel =
    notifyFailureChannelFocus === 'all'
      ? '全部失败通道'
      : channelMap.get(notifyFailureChannelFocus)?.channelName || notifyFailureChannelFocus;

  return {
    channelLabel,
    eventTypeLabel,
    statusLabel,
    focusedFailureChannelLabel,
    selectedReasonLabel: selectedFailureReason || '无',
    reasonHashLabel: normalizedReasonHashFilter || '无',
    retryGroupIdLabel: normalizedRetryGroupIdFilter || '无',
    keywordText: keyword.trim() || '无',
  };
}

export function buildDataOpsNotificationFailureDerivedState({
  filteredEvents,
  filteredFailedEvents,
  availableChannelIds,
  channelMap,
  notifyFailureChannelFocus,
  selectedFailureReason,
  labels,
  generatedAtText,
}: {
  filteredEvents: DataOpsNotificationEvent[];
  filteredFailedEvents: DataOpsNotificationEvent[];
  availableChannelIds: ReadonlySet<string>;
  channelMap: Map<string, DataOpsNotificationChannel>;
  notifyFailureChannelFocus: string;
  selectedFailureReason: string;
  labels: DataOpsNotificationFilterLabels;
  generatedAtText: string;
}): DataOpsNotificationFailureDerivedState {
  const channelIds = Array.from(new Set(filteredFailedEvents.map((item) => item.channelId))).sort(
    (left, right) => left.localeCompare(right, 'zh-CN')
  );
  const failureChannelOptions = channelIds.map((channelId) => ({
    label: channelMap.get(channelId)?.channelName || channelId,
    value: channelId,
  }));
  if (
    notifyFailureChannelFocus !== 'all' &&
    notifyFailureChannelFocus.trim() &&
    !channelIds.includes(notifyFailureChannelFocus)
  ) {
    failureChannelOptions.unshift({
      label: channelMap.get(notifyFailureChannelFocus)?.channelName || notifyFailureChannelFocus,
      value: notifyFailureChannelFocus,
    });
  }

  const focusedFailedEvents =
    notifyFailureChannelFocus === 'all'
      ? filteredFailedEvents
      : filteredFailedEvents.filter((item) => item.channelId === notifyFailureChannelFocus);
  const focusedRetryableFailedEvents = filterRetryableNotificationEvents(
    focusedFailedEvents,
    availableChannelIds
  );
  const summary = buildNotificationFailureSummary(focusedFailedEvents, {
    availableChannelIds,
  });
  const summaryText = buildNotificationFailureSummaryText(summary);
  const selectedReasonFailedEvents = filterNotificationEventsByFailureReason(
    focusedFailedEvents,
    selectedFailureReason
  );
  const selectedReasonRetryableFailedEvents = filterRetryableNotificationEvents(
    selectedReasonFailedEvents,
    availableChannelIds
  );
  const stats = buildNotificationFailureStats({
    totalCount: filteredEvents.length,
    failedEvents: focusedFailedEvents,
    retryableFailedEvents: focusedRetryableFailedEvents,
  });

  return {
    failureChannelOptions: [{ label: '全部失败通道', value: 'all' }, ...failureChannelOptions],
    focusedFailedEvents,
    focusedRetryableFailedEvents,
    summary,
    summaryText,
    selectedReasonFailedEvents,
    selectedReasonRetryableFailedEvents,
    stats,
    alertTemplateText: buildNotificationFailureAlertTemplateText({
      summaryItems: summary,
      summaryText,
      stats,
      generatedAtText,
      channelLabel: labels.channelLabel,
      eventTypeLabel: labels.eventTypeLabel,
      statusLabel: labels.statusLabel,
      focusedFailureChannelLabel: labels.focusedFailureChannelLabel,
      selectedReasonLabel: labels.selectedReasonLabel,
      reasonHashLabel: labels.reasonHashLabel,
      retryGroupIdLabel: labels.retryGroupIdLabel,
      keywordText: labels.keywordText,
      channelMap,
    }),
    markdownText: buildNotificationMarkdownText({
      events: filteredEvents,
      generatedAtText,
      channelLabel: labels.channelLabel,
      eventTypeLabel: labels.eventTypeLabel,
      statusLabel: labels.statusLabel,
      reasonHashLabel: labels.reasonHashLabel,
      retryGroupIdLabel: labels.retryGroupIdLabel,
      keywordText: labels.keywordText,
      channelMap,
    }),
  };
}
