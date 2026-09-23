import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import type { DataOpsNotificationTraceSloRiskLevel } from '@/types/dataops';

export type ChannelNameMap = Map<string, { channelName: string }>;

export interface NotificationFailureReasonSummaryItem {
  reason: string;
  count: number;
  retryableCount: number;
  eventIds: string[];
  titles: string[];
}

export interface NotificationRetryReportItem {
  eventId: string;
  title: string;
  channelId: string;
  channelName: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
}

export interface NotificationRetryReport {
  executedAt: string;
  concurrency: number;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  items: NotificationRetryReportItem[];
}

export interface NotificationRetryExecutionOptions {
  targetFailedEvents: DataOpsNotificationEvent[];
  confirmTitle: string;
  doneLabel: string;
  requestKeyPrefix: string;
  retryGroupId: string;
  emptyText: string;
}

export interface NotificationFailureStats {
  totalCount: number;
  failedCount: number;
  retryableFailedCount: number;
  impactedChannelIds: string[];
  impactedEventIds: string[];
}

export interface NotificationTraceReasonHashRecoverySummary {
  firstFailedCount: number;
  recoveredCount: number;
  unresolvedCount: number;
  recoveryRate: number;
}

export type NotificationTraceSloScanRiskSummary = Record<
  DataOpsNotificationTraceSloRiskLevel,
  number
>;

export interface NotificationTraceSloScanInputValues {
  lookbackHours: unknown;
  maxGroups: unknown;
  scanConcurrency: unknown;
}

export interface NotificationTraceSloScanRequestOptions {
  lookbackHours: number;
  maxGroups: number;
  scanConcurrency: number;
}

export interface NotificationAlertDraft {
  formValues: {
    channelId: string;
    messageTitle: string;
    messageText: string;
  };
  wasTruncated: boolean;
  truncatedWarningText: string;
}

export type NotificationTraceSloScanAlertDraft = NotificationAlertDraft;

export interface NotificationEventFilterOptions {
  channelFilter: string;
  eventTypeFilter: string;
  statusFilter: 'all' | DataOpsNotificationEvent['status'];
  normalizedReasonHashFilter: string;
  normalizedRetryGroupIdFilter: string;
  selectedFailureReason: string;
  normalizedKeyword: string;
}

export const NOTIFICATION_EVENTS_CSV_HEADERS = [
  'sent_at',
  'channel_id',
  'channel_name',
  'event_type',
  'event_type_label',
  'title',
  'target_table',
  'flow_name',
  'status',
  'level',
  'reason_hash',
  'retry_group_id',
  'detail',
];

export const NOTIFICATION_RETRY_REPORT_CSV_HEADERS = [
  'executed_at',
  'concurrency',
  'status',
  'event_id',
  'title',
  'channel_id',
  'channel_name',
  'message',
];

export const NOTIFICATION_RETRY_GROUP_TRACE_CSV_HEADERS = [
  'sent_at',
  'event_id',
  'channel_id',
  'channel_name',
  'event_type',
  'event_type_label',
  'status',
  'level',
  'title',
  'reason_hash',
  'retry_group_id',
  'detail',
];
