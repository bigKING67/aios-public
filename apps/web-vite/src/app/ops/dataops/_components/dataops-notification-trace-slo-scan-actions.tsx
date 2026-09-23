'use client';

import { BellOutlined, CopyOutlined } from '@ant-design/icons';
import { Button, Select, Tooltip } from 'antd';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import {
  getNotificationTraceSloScanQuickFilterLabel,
  type NotificationTraceSloScanQuickFilter,
} from './dataops-hub-formatters';
import batchResultStyles from './dataops-batch-result.module.css';

const NOTIFICATION_TRACE_SLO_SCAN_QUICK_FILTER_OPTIONS: Array<{
  label: string;
  value: NotificationTraceSloScanQuickFilter;
}> = [
  { label: '全部分组', value: 'all' },
  { label: '仅高风险', value: 'critical' },
  { label: '仅已命中', value: 'breached' },
  { label: '仅已触发', value: 'triggered' },
];

interface DataOpsNotificationTraceSloScanActionsProps {
  quickFilter: NotificationTraceSloScanQuickFilter;
  totalCount: number;
  displayedCount: number;
  markdownText: string;
  defaultAlertChannel: DataOpsNotificationChannel | null | undefined;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  onQuickFilterChange: (value: NotificationTraceSloScanQuickFilter) => void;
  onCopyMarkdown: () => void | Promise<void>;
  onSendAlert: () => void;
}

export function DataOpsNotificationTraceSloScanActions({
  quickFilter,
  totalCount,
  displayedCount,
  markdownText,
  defaultAlertChannel,
  hasOperatePermission,
  globalActionBusy,
  onQuickFilterChange,
  onCopyMarkdown,
  onSendAlert,
}: DataOpsNotificationTraceSloScanActionsProps) {
  const hasMarkdownText = Boolean(markdownText.trim());

  return (
    <div className={batchResultStyles.batchResultControls}>
      <Select<NotificationTraceSloScanQuickFilter>
        size="small"
        className={batchResultStyles.batchResultFilterSelect}
        value={quickFilter}
        onChange={onQuickFilterChange}
        options={NOTIFICATION_TRACE_SLO_SCAN_QUICK_FILTER_OPTIONS}
      />
      <Button
        size="small"
        icon={<CopyOutlined />}
        disabled={!hasMarkdownText}
        onClick={() => {
          void onCopyMarkdown();
        }}
      >
        复制值班摘要
      </Button>
      <Tooltip
        title={
          defaultAlertChannel
            ? `默认通道：${defaultAlertChannel.channelName}（点击可改）`
            : '当前没有可用通道'
        }
      >
        <Button
          size="small"
          icon={<BellOutlined />}
          disabled={
            !hasOperatePermission || globalActionBusy || !defaultAlertChannel || !hasMarkdownText
          }
          onClick={onSendAlert}
        >
          发送值班摘要
        </Button>
      </Tooltip>
      <span className={batchResultStyles.batchHistoryStatsText}>
        已按风险优先级排序，共 {totalCount} 组，当前
        {getNotificationTraceSloScanQuickFilterLabel(quickFilter)}
        {displayedCount} 组
      </span>
    </div>
  );
}
