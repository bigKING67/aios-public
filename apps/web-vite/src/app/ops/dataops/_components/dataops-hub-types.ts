import type { DataOpsAuditEvent, DataOpsNotificationEvent } from '@/config/dataops-hub';
import type {
  DataOpsBatchExecutionAction,
  DataOpsNotificationTraceSloScanItem,
} from '@/types/dataops';

export type TabKey = 'orchestration' | 'sync' | 'notify' | 'audit';
export type BatchResultFilter = 'all' | 'failed' | 'retryable_failed';
export type BatchHistoryFailureFilter = 'all' | 'has_failed';
export type BatchHistoryTimeRangeFilter = 'all' | '24h' | '7d';
export type NotificationStatusFilter = 'all' | DataOpsNotificationEvent['status'];
export type NotificationRetryConcurrency = 1 | 2 | 4;
export type NotificationTraceFilter = 'all' | 'failed' | 'retryable_failed';
export type NotificationTraceSloScanQuickFilter = 'all' | 'critical' | 'breached' | 'triggered';
export type AuditResultFilter = 'all' | DataOpsAuditEvent['result'];
export type AuditTimeRangeFilter = 'all' | '24h' | '7d';
export type AlertSendModalSource =
  | 'batch_history'
  | 'notify_channel'
  | 'notify_event_retry'
  | 'notify_markdown'
  | 'notify_failure_summary'
  | 'notify_trace_slo_scan';
export type BatchOperationAction = DataOpsBatchExecutionAction;

export interface NotificationTraceSloScanRankedItem extends DataOpsNotificationTraceSloScanItem {
  rank: number;
}
