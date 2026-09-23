'use client';

import { Alert, Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import type { DataOpsNotificationTraceSloScanResponse } from '@/types/dataops';
import {
  truncateText,
  type NotificationTraceSloScanQuickFilter,
  type NotificationTraceSloScanRankedItem,
} from './dataops-hub-formatters';
import type { NotificationTraceSloScanRiskSummary } from './dataops-notification-retry-helpers';
import { DataOpsNotificationTraceSloScanActions } from './dataops-notification-trace-slo-scan-actions';
import { DataOpsNotificationTraceSloScanSummary } from './dataops-notification-trace-slo-scan-summary';
import shellStyles from './dataops-shell.module.css';

interface DataOpsNotificationTraceSloScanResultProps {
  result: DataOpsNotificationTraceSloScanResponse;
  riskSummary: NotificationTraceSloScanRiskSummary;
  quickFilter: NotificationTraceSloScanQuickFilter;
  rankedItems: NotificationTraceSloScanRankedItem[];
  displayedItems: NotificationTraceSloScanRankedItem[];
  markdownText: string;
  defaultAlertChannel: DataOpsNotificationChannel | null | undefined;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  columns: ColumnsType<NotificationTraceSloScanRankedItem>;
  isCompactViewport: boolean;
  onQuickFilterChange: (value: NotificationTraceSloScanQuickFilter) => void;
  onCopyMarkdown: () => void | Promise<void>;
  onSendAlert: () => void;
}

export function DataOpsNotificationTraceSloScanResult({
  result,
  riskSummary,
  quickFilter,
  rankedItems,
  displayedItems,
  markdownText,
  defaultAlertChannel,
  hasOperatePermission,
  globalActionBusy,
  columns,
  isCompactViewport,
  onQuickFilterChange,
  onCopyMarkdown,
  onSendAlert,
}: DataOpsNotificationTraceSloScanResultProps) {
  return (
    <>
      <DataOpsNotificationTraceSloScanSummary result={result} riskSummary={riskSummary} />
      <DataOpsNotificationTraceSloScanActions
        quickFilter={quickFilter}
        totalCount={rankedItems.length}
        displayedCount={displayedItems.length}
        markdownText={markdownText}
        defaultAlertChannel={defaultAlertChannel}
        hasOperatePermission={hasOperatePermission}
        globalActionBusy={globalActionBusy}
        onQuickFilterChange={onQuickFilterChange}
        onCopyMarkdown={onCopyMarkdown}
        onSendAlert={onSendAlert}
      />
      {result.warnings.length ? (
        <Alert
          type="warning"
          showIcon
          title={`巡检告警 ${result.warnings.length} 条`}
          description={truncateText(result.warnings.join('；'), 420)}
          className={shellStyles.riskAlert}
        />
      ) : null}
      {result.items.length ? (
        <Table<NotificationTraceSloScanRankedItem>
          rowKey={(record) => `${record.retryGroupId}:${record.latestEventAt}`}
          columns={columns}
          dataSource={displayedItems}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          size="small"
          scroll={isCompactViewport ? undefined : { x: 'max-content' }}
        />
      ) : (
        <Empty description="当前巡检范围没有可评估的链路分组" />
      )}
    </>
  );
}
