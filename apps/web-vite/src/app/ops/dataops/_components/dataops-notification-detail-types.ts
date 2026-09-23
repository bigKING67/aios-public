import type { ReactNode } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsNotificationChannel, DataOpsNotificationEvent } from '@/config/dataops-hub';
import type {
  NotificationFailureReasonSummaryItem,
  NotificationRetryReport,
} from './dataops-notification-retry-helpers';
import type {
  NotificationRetryConcurrency,
  NotificationStatusFilter,
} from './dataops-hub-formatters';

export interface DataOpsNotificationDetailProps {
  filteredEvents: DataOpsNotificationEvent[];
  notificationEvents: DataOpsNotificationEvent[];
  filteredFailedCount: number;
  filteredRetryableFailedCount: number;
  notificationRetryConcurrency: NotificationRetryConcurrency;
  channelFilter: string;
  notificationEventTypeFilter: string;
  notificationStatusFilter: NotificationStatusFilter;
  notificationChannelSelectOptions: Array<{ label: string; value: string }>;
  notificationEventTypeOptions: Array<{ label: string; value: string }>;
  notificationRetryReport: NotificationRetryReport | null;
  notificationTraceSloScanRunning: boolean;
  notificationBatchRetrySubmitting: boolean;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  defaultAlertChannel: DataOpsNotificationChannel | null;
  notificationMarkdownText: string;
  failedNotificationEventIdCount: number;
  notifyReasonHashFilter: string;
  notifyRetryGroupIdFilter: string;
  notificationFailureSummary: NotificationFailureReasonSummaryItem[];
  notifyFailureChannelFocus: string;
  notifyFailureChannelOptions: Array<{ label: string; value: string }>;
  selectedNotifyFailureReason: string;
  selectedReasonFailedCount: number;
  selectedReasonRetryableCount: number;
  notificationFailureSummaryText: string;
  notificationFailureAlertTemplateText: string;
  columns: ColumnsType<DataOpsNotificationEvent>;
  isCompactViewport: boolean;
  renderExpandedRow: (record: DataOpsNotificationEvent) => ReactNode;
  renderPaginationTotal: (total: number, range: [number, number]) => string;
  onChannelFilterChange: (value: string) => void;
  onEventTypeFilterChange: (value: string) => void;
  onStatusFilterChange: (value: NotificationStatusFilter) => void;
  onResetFilters: () => void;
  onRetryConcurrencyChange: (value: NotificationRetryConcurrency) => void;
  onRetryFilteredFailed: () => void | Promise<void>;
  onReasonHashFilterChange: (value: string) => void;
  onRetryGroupIdFilterChange: (value: string) => void;
  onOpenRetryGroupTrace: (retryGroupId: string) => void;
  onOpenTraceSloScan: () => void;
  onOpenManualNotify: (channel: DataOpsNotificationChannel) => void;
  onExportEventsCsv: () => Promise<void>;
  onExportRetryReportCsv: () => Promise<void>;
  onCopyMarkdown: () => Promise<void>;
  onSendMarkdown: () => void;
  onCopyFailedEventIds: () => Promise<void>;
  onCopyFilterLink: () => Promise<void>;
  onChannelFocusChange: (value: string) => void;
  onRetrySelectedReason: () => Promise<void>;
  onClearSelectedReason: () => void;
  onCopy: (text: string, label: string) => Promise<void>;
  onSendAlertTemplate: () => void;
  onApplyReasonFilter: (reason: string) => void;
}
