import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import type {
  DataOpsNotificationTraceReasonHashRecoveryItem,
  DataOpsNotificationTraceResponse,
  DataOpsNotificationTraceSloStatus,
  DataOpsNotificationTraceSummary,
  DataOpsRuntimeResponse,
} from '@/types/dataops';
import type {
  NotificationFailureReasonSummaryItem,
  NotificationFailureStats,
  NotificationTraceReasonHashRecoverySummary,
} from './dataops-notification-retry-helpers';

export type DataOpsHubMetrics = DataOpsRuntimeResponse['metrics'];

export interface DataOpsStatusSummary {
  total: number;
  healthy: number;
  warning: number;
  error: number;
  paused: number;
}

export interface DataOpsNotificationChannelSummary {
  totalCount: number;
  activeCount: number;
  pausedCount: number;
  riskCount: number;
  failureCount24h: number;
}

export interface DataOpsRetryGroupTraceDerivedState {
  events: DataOpsNotificationEvent[];
  failedEvents: DataOpsNotificationEvent[];
  retryableFailedEvents: DataOpsNotificationEvent[];
  reasonHashRecovery: DataOpsNotificationTraceReasonHashRecoveryItem[];
  reasonHashFocusLabel: string;
  filteredEvents: DataOpsNotificationEvent[];
  reasonHashRecoverySummary: NotificationTraceReasonHashRecoverySummary | null;
  sloStatus: DataOpsNotificationTraceSloStatus | null;
  sloDescription: string;
  summary: DataOpsNotificationTraceSummary | null;
  source: DataOpsNotificationTraceResponse['source'] | null;
}

export interface DataOpsNotificationFilterLabels {
  channelLabel: string;
  eventTypeLabel: string;
  statusLabel: string;
  focusedFailureChannelLabel: string;
  selectedReasonLabel: string;
  reasonHashLabel: string;
  retryGroupIdLabel: string;
  keywordText: string;
}

export interface DataOpsNotificationFailureDerivedState {
  failureChannelOptions: Array<{ label: string; value: string }>;
  focusedFailedEvents: DataOpsNotificationEvent[];
  focusedRetryableFailedEvents: DataOpsNotificationEvent[];
  summary: NotificationFailureReasonSummaryItem[];
  summaryText: string;
  selectedReasonFailedEvents: DataOpsNotificationEvent[];
  selectedReasonRetryableFailedEvents: DataOpsNotificationEvent[];
  stats: NotificationFailureStats;
  alertTemplateText: string;
  markdownText: string;
}
