'use client';

import { Alert, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import type { DataOpsNotificationTraceSloScanResponse } from '@/types/dataops';
import type {
  NotificationTraceSloScanQuickFilter,
  NotificationTraceSloScanRankedItem,
} from './dataops-hub-formatters';
import type { NotificationTraceSloScanRiskSummary } from './dataops-notification-retry-helpers';
import { DataOpsNotificationTraceSloScanControls } from './dataops-notification-trace-slo-scan-controls';
import { DataOpsNotificationTraceSloScanResult } from './dataops-notification-trace-slo-scan-result';
import shellStyles from './dataops-shell.module.css';

interface DataOpsNotificationTraceSloScanModalBodyProps {
  dryRun: boolean;
  running: boolean;
  lookbackHours: number;
  maxGroups: number;
  concurrency: number;
  result: DataOpsNotificationTraceSloScanResponse | null;
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
  onDryRunChange: (value: boolean) => void;
  onLookbackHoursChange: (value: number) => void;
  onMaxGroupsChange: (value: number) => void;
  onConcurrencyChange: (value: number) => void;
  onQuickFilterChange: (value: NotificationTraceSloScanQuickFilter) => void;
  onCopyMarkdown: () => void | Promise<void>;
  onSendAlert: () => void;
}

export function DataOpsNotificationTraceSloScanModalBody({
  dryRun,
  running,
  lookbackHours,
  maxGroups,
  concurrency,
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
  onDryRunChange,
  onLookbackHoursChange,
  onMaxGroupsChange,
  onConcurrencyChange,
  onQuickFilterChange,
  onCopyMarkdown,
  onSendAlert,
}: DataOpsNotificationTraceSloScanModalBodyProps) {
  return (
    <>
      <DataOpsNotificationTraceSloScanControls
        dryRun={dryRun}
        running={running}
        lookbackHours={lookbackHours}
        maxGroups={maxGroups}
        concurrency={concurrency}
        onDryRunChange={onDryRunChange}
        onLookbackHoursChange={onLookbackHoursChange}
        onMaxGroupsChange={onMaxGroupsChange}
        onConcurrencyChange={onConcurrencyChange}
      />
      <Alert
        type={dryRun ? 'info' : 'warning'}
        showIcon
        title={
          dryRun ? 'Dry Run 模式：只做评估，不执行告警动作' : '执行模式：会写入审计并可能触发飞书告警'
        }
        description="巡检会按 retryGroupId 聚合链路，基于 reasonHash 恢复率评估 SLO。默认优先读取 Postgres 索引，回退时会在结果中给出告警。"
        className={shellStyles.riskAlert}
      />
      {result ? (
        <DataOpsNotificationTraceSloScanResult
          result={result}
          riskSummary={riskSummary}
          quickFilter={quickFilter}
          rankedItems={rankedItems}
          displayedItems={displayedItems}
          markdownText={markdownText}
          defaultAlertChannel={defaultAlertChannel}
          hasOperatePermission={hasOperatePermission}
          globalActionBusy={globalActionBusy}
          columns={columns}
          isCompactViewport={isCompactViewport}
          onQuickFilterChange={onQuickFilterChange}
          onCopyMarkdown={onCopyMarkdown}
          onSendAlert={onSendAlert}
        />
      ) : (
        <Empty description="尚未执行巡检，点击右下角按钮开始。默认使用 Dry Run 模式。" />
      )}
    </>
  );
}
