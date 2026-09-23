'use client';

import { Button, Select, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DataOpsFailureSummaryActions } from './dataops-failure-summary-actions';
import type { NotificationFailureReasonSummaryItem } from './dataops-notification-retry-helpers';
import { truncateText } from './dataops-hub-formatters';
import batchStyles from './dataops-batch-controls.module.css';
import failureSummaryStyles from './dataops-failure-summary.module.css';
import styles from './dataops-hub.module.css';
import notifyStyles from './dataops-notify-panel.module.css';

interface DataOpsNotificationFailureSummaryPanelProps {
  items: NotificationFailureReasonSummaryItem[];
  channelFocus: string;
  channelOptions: Array<{ label: string; value: string }>;
  selectedReason: string;
  selectedReasonFailedCount: number;
  selectedReasonRetryableCount: number;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  summaryText: string;
  alertTemplateText: string;
  markdownText: string;
  defaultAlertChannelName: string | null;
  hasDefaultAlertChannel: boolean;
  onChannelFocusChange: (value: string) => void;
  onRetrySelectedReason: () => Promise<void>;
  onClearSelectedReason: () => void;
  onCopy: (text: string, label: string) => Promise<void>;
  onSendAlertTemplate: () => void;
  onSendMarkdown: () => void;
  onApplyReasonFilter: (reason: string) => void;
}

export function DataOpsNotificationFailureSummaryPanel({
  items,
  channelFocus,
  channelOptions,
  selectedReason,
  selectedReasonFailedCount,
  selectedReasonRetryableCount,
  hasOperatePermission,
  globalActionBusy,
  summaryText,
  alertTemplateText,
  markdownText,
  defaultAlertChannelName,
  hasDefaultAlertChannel,
  onChannelFocusChange,
  onRetrySelectedReason,
  onClearSelectedReason,
  onCopy,
  onSendAlertTemplate,
  onSendMarkdown,
  onApplyReasonFilter,
}: DataOpsNotificationFailureSummaryPanelProps) {
  if (!items.length) {
    return null;
  }

  const alertTooltipTitle = defaultAlertChannelName
    ? `默认通道：${defaultAlertChannelName}（点击可改）`
    : '当前没有可用通道';

  return (
    <details className={notifyStyles.notifyFailureFold}>
      <summary className={notifyStyles.notifyFailureFoldSummary}>
        <div className={notifyStyles.notifyFailureFoldTitle}>
          <strong>通知失败原因聚合（Top 8）</strong>
          <span>展开后可按失败原因快速筛选与重发</span>
        </div>
        <span className={styles.notifyDataBadge}>原因 {items.length} 条</span>
      </summary>
      <div className={failureSummaryStyles.batchFailureSummaryPanel}>
        <div className={failureSummaryStyles.batchFailureSummaryHead}>
          <div className={failureSummaryStyles.batchFailureSummaryHeadMain}>
            <strong>失败原因处理</strong>
            <span>选中一条原因后可直接重发对应失败通知</span>
          </div>
          <div className={notifyStyles.notifyFailureActions}>
            <Select<string>
              size="small"
              value={channelFocus}
              onChange={onChannelFocusChange}
              options={channelOptions}
              className={styles.notifyFailureChannelSelect}
            />
            <Button
              size="small"
              icon={<ReloadOutlined />}
              disabled={
                !hasOperatePermission || globalActionBusy || selectedReasonRetryableCount === 0
              }
              onClick={() => {
                void onRetrySelectedReason();
              }}
            >
              重发选中原因
              {selectedReasonFailedCount ? `(${selectedReasonFailedCount})` : ''}
            </Button>
            <Button size="small" disabled={!selectedReason} onClick={onClearSelectedReason}>
              清除选中
            </Button>
            <details
              className={`${notifyStyles.notifyAdvancedPanel} ${notifyStyles.notifyAdvancedInline}`}
            >
              <summary>更多摘要操作</summary>
              <div className={batchStyles.batchQuickActions}>
                <DataOpsFailureSummaryActions
                  summaryText={summaryText}
                  summaryCopyLabel="通知失败原因聚合摘要"
                  alertTemplateText={alertTemplateText}
                  alertTemplateCopyLabel="通知失败告警模板"
                  alertTemplateCopyDisabled={!alertTemplateText}
                  alertTooltipTitle={alertTooltipTitle}
                  alertSendDisabled={
                    !hasOperatePermission ||
                    globalActionBusy ||
                    !alertTemplateText ||
                    !hasDefaultAlertChannel
                  }
                  onCopy={onCopy}
                  onSendAlertTemplate={onSendAlertTemplate}
                  reportAction={{
                    tooltipTitle: alertTooltipTitle,
                    sendDisabled:
                      !hasOperatePermission ||
                      globalActionBusy ||
                      !markdownText ||
                      !hasDefaultAlertChannel,
                    onSend: onSendMarkdown,
                    label: '发送筛选报告',
                  }}
                />
              </div>
            </details>
          </div>
        </div>
        {selectedReason ? (
          <div className={batchStyles.batchSummaryInfo}>
            已选中原因：{truncateText(selectedReason, 42)} · 失败
            {selectedReasonFailedCount} 条 · 可重发
            {selectedReasonRetryableCount} 条
          </div>
        ) : null}
        <div className={failureSummaryStyles.batchFailureSummaryList}>
          {items.map((item) => (
            <button
              key={item.reason}
              type="button"
              className={`${failureSummaryStyles.batchFailureSummaryItem}${
                selectedReason === item.reason
                  ? ` ${failureSummaryStyles.batchFailureSummaryItemActive}`
                  : ''
              }`}
              onClick={() => onApplyReasonFilter(item.reason)}
            >
              <Tag color="red">x{item.count}</Tag>
              <p>{truncateText(item.reason, 120)}</p>
              <span>
                可重发：{item.retryableCount} · 事件：
                {truncateText(item.titles.join(' / '), 120)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
