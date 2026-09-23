'use client';

import { Button, Input, Tooltip } from 'antd';
import { BellOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import type { NotificationRetryReport } from './dataops-notification-retry-helpers';
import notifyStyles from './dataops-notify-panel.module.css';
import styles from './dataops-hub.module.css';

interface DataOpsNotificationAdvancedToolsProps {
  reasonHashFilter: string;
  onReasonHashFilterChange: (value: string) => void;
  retryGroupIdFilter: string;
  onRetryGroupIdFilterChange: (value: string) => void;
  notificationRetryReport: NotificationRetryReport | null;
  notificationTraceSloScanRunning: boolean;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  defaultAlertChannel: DataOpsNotificationChannel | null;
  notificationMarkdownText: string;
  failedNotificationEventIdCount: number;
  onOpenRetryGroupTrace: (retryGroupId: string) => void;
  onOpenTraceSloScan: () => void;
  onOpenManualNotify: (channel: DataOpsNotificationChannel) => void;
  onExportEventsCsv: () => Promise<void>;
  onExportRetryReportCsv: () => Promise<void>;
  onCopyMarkdown: () => Promise<void>;
  onSendMarkdown: () => void;
  onCopyFailedEventIds: () => Promise<void>;
  onCopyFilterLink: () => Promise<void>;
}

export function DataOpsNotificationAdvancedTools({
  reasonHashFilter,
  onReasonHashFilterChange,
  retryGroupIdFilter,
  onRetryGroupIdFilterChange,
  notificationRetryReport,
  notificationTraceSloScanRunning,
  hasOperatePermission,
  globalActionBusy,
  defaultAlertChannel,
  notificationMarkdownText,
  failedNotificationEventIdCount,
  onOpenRetryGroupTrace,
  onOpenTraceSloScan,
  onOpenManualNotify,
  onExportEventsCsv,
  onExportRetryReportCsv,
  onCopyMarkdown,
  onSendMarkdown,
  onCopyFailedEventIds,
  onCopyFilterLink,
}: DataOpsNotificationAdvancedToolsProps) {
  const defaultAlertChannelName = defaultAlertChannel?.channelName;

  return (
    <details className={`${notifyStyles.notifyAdvancedPanel} ${notifyStyles.notifyAdvancedInline}`}>
      <summary>展开更多筛选与工具</summary>
      <div className={notifyStyles.notifyFilterGroup}>
        <Input
          allowClear
          size="small"
          value={reasonHashFilter}
          onChange={(event) => onReasonHashFilterChange(event.target.value)}
          placeholder="reasonHash 前缀"
          className={styles.notifyTokenInput}
        />
        <Input
          allowClear
          size="small"
          value={retryGroupIdFilter}
          onChange={(event) => onRetryGroupIdFilterChange(event.target.value)}
          placeholder="retryGroupId（支持模糊）"
          className={styles.notifyTokenInput}
        />
        <Button
          size="small"
          disabled={!retryGroupIdFilter.trim()}
          onClick={() => onOpenRetryGroupTrace(retryGroupIdFilter)}
        >
          查看链路
        </Button>
        <Button
          size="small"
          loading={notificationTraceSloScanRunning}
          disabled={!hasOperatePermission || globalActionBusy}
          onClick={onOpenTraceSloScan}
        >
          执行SLO巡检
        </Button>
        <Button
          size="small"
          disabled={!hasOperatePermission || globalActionBusy || !defaultAlertChannel}
          onClick={() => {
            if (defaultAlertChannel) {
              onOpenManualNotify(defaultAlertChannel);
            }
          }}
        >
          手动发送
        </Button>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={() => {
            void onExportEventsCsv();
          }}
        >
          导出CSV
        </Button>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          disabled={!notificationRetryReport || notificationRetryReport.items.length === 0}
          onClick={() => {
            void onExportRetryReportCsv();
          }}
        >
          导出重发结果
        </Button>
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!notificationMarkdownText}
          onClick={() => {
            void onCopyMarkdown();
          }}
        >
          复制Markdown
        </Button>
        <Tooltip
          title={
            defaultAlertChannelName
              ? `默认通道：${defaultAlertChannelName}（点击可改）`
              : '当前没有可用通道'
          }
        >
          <Button
            size="small"
            icon={<BellOutlined />}
            disabled={
              !hasOperatePermission ||
              globalActionBusy ||
              !notificationMarkdownText ||
              !defaultAlertChannel
            }
            onClick={onSendMarkdown}
          >
            发送Markdown
          </Button>
        </Tooltip>
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!failedNotificationEventIdCount}
          onClick={() => {
            void onCopyFailedEventIds();
          }}
        >
          复制失败事件ID
          {failedNotificationEventIdCount ? `(${failedNotificationEventIdCount})` : ''}
        </Button>
        <Button
          size="small"
          icon={<CopyOutlined />}
          onClick={() => {
            void onCopyFilterLink();
          }}
        >
          复制筛选链接
        </Button>
      </div>
    </details>
  );
}
