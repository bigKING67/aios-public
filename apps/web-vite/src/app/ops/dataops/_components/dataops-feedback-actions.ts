import type { MessageInstance } from 'antd/es/message/interface';

import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import {
  buildBatchHistoryCsvRows,
  BATCH_HISTORY_CSV_HEADERS,
  type BatchExecutionSummary,
} from './dataops-batch-helpers';
import {
  buildDataOpsCsvFileName,
  copyDataOpsLinesToClipboard,
  copyNormalizedTextToClipboard,
  copyTextToClipboardText,
  exportDataOpsCsvWithFeedback,
  type DataOpsCsvCell,
} from './dataops-export-helpers';
import {
  getActionErrorMessage,
} from './dataops-action-helpers';
import {
  buildNotificationEventsCsvRows,
  buildNotificationRetryReportCsvRows,
  NOTIFICATION_EVENTS_CSV_HEADERS,
  NOTIFICATION_RETRY_REPORT_CSV_HEADERS,
  type NotificationRetryReport,
} from './dataops-notification-retry-helpers';
import { buildRetryGroupTraceCsvExportPayload } from './dataops-notification-trace-interaction-helpers';
import { copyDataOpsBatchResultFailedPipelineIds } from './dataops-batch-result-modal-helpers';

type NotificationChannelMap = Map<string, { channelName: string }>;

export type DataOpsCsvExportActionOptions = {
  headers: string[];
  rows: DataOpsCsvCell[][];
  fileName: string;
  downloadSuccessText: string;
  clipboardSuccessText: string;
};

export function createDataOpsFeedbackActions(message: MessageInstance) {
  const copyTextToClipboard = async (text: string, label: string) => {
    await copyDataOpsTextToClipboard({
      text,
      label,
      writeText: copyTextToClipboardText,
      success: message.success,
      error: message.error,
      getErrorMessage: getActionErrorMessage,
    });
  };

  const exportDataOpsCsv = async (options: DataOpsCsvExportActionOptions) => {
    await exportDataOpsCsvWithFeedback({
      ...options,
      success: message.success,
      error: message.error,
      getErrorMessage: getActionErrorMessage,
    });
  };

  return {
    copyTextToClipboard,
    exportDataOpsCsv,
  };
}

export async function copyDataOpsTextToClipboard({
  text,
  label,
  writeText,
  success,
  error,
  getErrorMessage: resolveErrorMessage,
}: {
  text: string;
  label: string;
  writeText: (text: string) => Promise<void>;
  success: (content: string) => void;
  error: (content: string) => void;
  getErrorMessage: (error: unknown) => string;
}): Promise<void> {
  try {
    await writeText(text);
    success(`${label}已复制`);
  } catch (caughtError) {
    error(`复制失败，请手动复制。${resolveErrorMessage(caughtError)}`);
  }
}

export async function copyDataOpsBatchFailedPipelineIds(options: {
  summary: BatchExecutionSummary | null;
  copyText: (text: string, label: string) => Promise<void>;
  info: (content: string) => void;
}) {
  await copyDataOpsBatchResultFailedPipelineIds({
    summary: options.summary,
    copyText: options.copyText,
    info: options.info,
  });
}

export async function copyDataOpsNormalizedText(options: {
  text: string;
  copy: (text: string, label: string) => Promise<void>;
  label: string;
  onEmpty: () => void;
}) {
  await copyNormalizedTextToClipboard(options);
}

export async function copyDataOpsLines(options: {
  lines: readonly string[];
  copy: (text: string, label: string) => Promise<void>;
  label: string;
  onEmpty: () => void;
}) {
  await copyDataOpsLinesToClipboard(options);
}

export async function exportDataOpsNotificationEventsCsv(options: {
  filteredEvents: DataOpsNotificationEvent[];
  notificationChannelMap: NotificationChannelMap;
  exportCsv: (options: DataOpsCsvExportActionOptions) => Promise<void>;
  info: (content: string) => void;
}) {
  if (!options.filteredEvents.length) {
    options.info('当前筛选条件下没有可导出的通知记录。');
    return;
  }

  const rows = buildNotificationEventsCsvRows(
    options.filteredEvents,
    options.notificationChannelMap
  );
  const fileName = buildDataOpsCsvFileName('dataops-notification-events');
  await options.exportCsv({
    headers: NOTIFICATION_EVENTS_CSV_HEADERS,
    rows,
    fileName,
    downloadSuccessText: `已导出 ${rows.length} 条通知记录到 ${fileName}`,
    clipboardSuccessText: '通知记录CSV已复制',
  });
}

export async function exportDataOpsNotificationRetryReportCsv(options: {
  report: NotificationRetryReport | null;
  exportCsv: (options: DataOpsCsvExportActionOptions) => Promise<void>;
  info: (content: string) => void;
}) {
  if (!options.report || !options.report.items.length) {
    options.info('暂无通知重发结果可导出。');
    return;
  }

  const rows = buildNotificationRetryReportCsvRows(options.report);
  const fileName = buildDataOpsCsvFileName('dataops-notification-retry-report');
  await options.exportCsv({
    headers: NOTIFICATION_RETRY_REPORT_CSV_HEADERS,
    rows,
    fileName,
    downloadSuccessText: `已导出 ${rows.length} 条通知重发结果到 ${fileName}`,
    clipboardSuccessText: '通知重发结果CSV已复制',
  });
}

export async function exportDataOpsRetryGroupTraceCsv(options: {
  activeRetryGroupTraceId: string;
  retryGroupTraceEvents: DataOpsNotificationEvent[];
  notificationChannelMap: NotificationChannelMap;
  exportCsv: (options: DataOpsCsvExportActionOptions) => Promise<void>;
  info: (content: string) => void;
}) {
  if (!options.retryGroupTraceEvents.length) {
    options.info('当前没有可导出的重发链路事件。');
    return;
  }

  await options.exportCsv(
    buildRetryGroupTraceCsvExportPayload({
      activeRetryGroupTraceId: options.activeRetryGroupTraceId,
      retryGroupTraceEvents: options.retryGroupTraceEvents,
      notificationChannelMap: options.notificationChannelMap,
    })
  );
}

export async function exportDataOpsBatchHistoryCsv(options: {
  filteredBatchHistoryItems: BatchExecutionSummary[];
  exportCsv: (options: DataOpsCsvExportActionOptions) => Promise<void>;
  info: (content: string) => void;
}) {
  if (!options.filteredBatchHistoryItems.length) {
    options.info('当前筛选条件下没有可导出的批量历史。');
    return;
  }

  const rows = buildBatchHistoryCsvRows(options.filteredBatchHistoryItems);
  const fileName = buildDataOpsCsvFileName('dataops-batch-history');
  await options.exportCsv({
    headers: BATCH_HISTORY_CSV_HEADERS,
    rows,
    fileName,
    downloadSuccessText: `已导出 ${rows.length} 条批量历史到 ${fileName}`,
    clipboardSuccessText: '批量历史CSV已复制',
  });
}
