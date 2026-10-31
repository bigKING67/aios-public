import { Button } from '@lobehub/ui';
import { RotateCw } from 'lucide-react';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import type { NotificationRetryReport } from './dataops-notification-retry-helpers';
import type {
  NotificationRetryConcurrency,
  NotificationStatusFilter,
} from './dataops-hub-formatters';
import { DataOpsNotificationAdvancedTools } from './dataops-notification-advanced-tools';
import { DATAOPS_ICON_PROPS } from './dataops-icon-props';
import notifyStyles from './dataops-notify-panel.module.css';
import styles from './dataops-hub.module.css';

interface DataOpsNotificationToolbarProps {
  matchedEventCount: number;
  totalEventCount: number;
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
}

export function DataOpsNotificationToolbar({
  matchedEventCount,
  totalEventCount,
  filteredFailedCount,
  filteredRetryableFailedCount,
  notificationRetryConcurrency,
  channelFilter,
  notificationEventTypeFilter,
  notificationStatusFilter,
  notificationChannelSelectOptions,
  notificationEventTypeOptions,
  notificationRetryReport,
  notificationTraceSloScanRunning,
  notificationBatchRetrySubmitting,
  hasOperatePermission,
  globalActionBusy,
  defaultAlertChannel,
  notificationMarkdownText,
  failedNotificationEventIdCount,
  notifyReasonHashFilter,
  notifyRetryGroupIdFilter,
  onChannelFilterChange,
  onEventTypeFilterChange,
  onStatusFilterChange,
  onResetFilters,
  onRetryConcurrencyChange,
  onRetryFilteredFailed,
  onReasonHashFilterChange,
  onRetryGroupIdFilterChange,
  onOpenRetryGroupTrace,
  onOpenTraceSloScan,
  onOpenManualNotify,
  onExportEventsCsv,
  onExportRetryReportCsv,
  onCopyMarkdown,
  onSendMarkdown,
  onCopyFailedEventIds,
  onCopyFilterLink,
}: DataOpsNotificationToolbarProps) {
  return (
    <div className={notifyStyles.notifyToolbox}>
      <div className={notifyStyles.notifyToolbarRow}>
        <div className={notifyStyles.notifyFilterGroup}>
          <LabeledSelect<string>
            label="通知通道"
            value={channelFilter}
            onChange={(value) => value !== undefined && onChannelFilterChange(value)}
            options={notificationChannelSelectOptions}
            wrapperClassName={styles.channelSelect}
          />
          <LabeledSelect<string>
            label="事件类型"
            value={notificationEventTypeFilter}
            onChange={(value) => value !== undefined && onEventTypeFilterChange(value)}
            options={notificationEventTypeOptions}
            wrapperClassName={styles.channelSelect}
          />
          <LabeledSelect<NotificationStatusFilter>
            label="发送状态"
            value={notificationStatusFilter}
            onChange={(value) => value && onStatusFilterChange(value)}
            options={[
              { label: '全部状态', value: 'all' },
              { label: '已发送', value: 'sent' },
              { label: '发送失败', value: 'failed' },
              { label: '已跳过', value: 'skipped' },
            ]}
            wrapperClassName={styles.channelSelect}
          />
          <Button size="small" onClick={onResetFilters}>
            重置筛选
          </Button>
        </div>

        <div className={notifyStyles.notifyActionGroup}>
          <LabeledSelect<NotificationRetryConcurrency>
            label="重发并发"
            size="small"
            value={notificationRetryConcurrency}
            onChange={(value) => value && onRetryConcurrencyChange(value)}
            options={[
              { label: '重发并发 x1', value: 1 },
              { label: '重发并发 x2', value: 2 },
              { label: '重发并发 x4', value: 4 },
            ]}
            wrapperClassName={styles.notifyConcurrencySelect}
          />
          <Button
            size="small"
            icon={<RotateCw {...DATAOPS_ICON_PROPS} />}
            loading={notificationBatchRetrySubmitting}
            disabled={!hasOperatePermission || globalActionBusy || filteredRetryableFailedCount === 0}
            onClick={() => {
              void onRetryFilteredFailed();
            }}
          >
            按筛选重发失败
            {filteredFailedCount ? `(${filteredFailedCount})` : ''}
          </Button>
        </div>
      </div>

      <div className={notifyStyles.notifyToolbarMeta}>
        <span className={styles.notifyDataBadge}>
          匹配 {matchedEventCount} / 总计 {totalEventCount}
        </span>
        <span className={styles.notifyDataBadge}>
          失败 {filteredFailedCount} · 可重发
          {filteredRetryableFailedCount}
        </span>
        {notificationRetryReport ? (
          <span className={notifyStyles.notifyRetryMeta}>
            最近重发：{notificationRetryReport.executedAt} · 成功
            {notificationRetryReport.successCount} / 失败
            {notificationRetryReport.failedCount} / 跳过
            {notificationRetryReport.skippedCount}
          </span>
        ) : null}
      </div>

      <DataOpsNotificationAdvancedTools
        reasonHashFilter={notifyReasonHashFilter}
        onReasonHashFilterChange={onReasonHashFilterChange}
        retryGroupIdFilter={notifyRetryGroupIdFilter}
        onRetryGroupIdFilterChange={onRetryGroupIdFilterChange}
        notificationRetryReport={notificationRetryReport}
        notificationTraceSloScanRunning={notificationTraceSloScanRunning}
        hasOperatePermission={hasOperatePermission}
        globalActionBusy={globalActionBusy}
        defaultAlertChannel={defaultAlertChannel}
        notificationMarkdownText={notificationMarkdownText}
        failedNotificationEventIdCount={failedNotificationEventIdCount}
        onOpenRetryGroupTrace={onOpenRetryGroupTrace}
        onOpenTraceSloScan={onOpenTraceSloScan}
        onOpenManualNotify={onOpenManualNotify}
        onExportEventsCsv={onExportEventsCsv}
        onExportRetryReportCsv={onExportRetryReportCsv}
        onCopyMarkdown={onCopyMarkdown}
        onSendMarkdown={onSendMarkdown}
        onCopyFailedEventIds={onCopyFailedEventIds}
        onCopyFilterLink={onCopyFilterLink}
      />
    </div>
  );
}
