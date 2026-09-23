'use client';

import { Tag } from 'antd';
import { DataOpsFailureSummaryActions } from './dataops-failure-summary-actions';
import type { BatchFailureReasonSummaryItem } from './dataops-batch-helpers';
import { truncateText } from './dataops-hub-formatters';
import failureSummaryStyles from './dataops-failure-summary.module.css';

interface DataOpsBatchHistoryFailureSummaryPanelProps {
  items: BatchFailureReasonSummaryItem[];
  summaryText: string;
  alertTemplateText: string;
  alertTooltipTitle: string;
  alertSendDisabled: boolean;
  onCopy: (text: string, label: string) => Promise<void>;
  onSendAlertTemplate: () => void;
  onApplyReasonFilter: (reason: string) => void;
}

export function DataOpsBatchHistoryFailureSummaryPanel({
  items,
  summaryText,
  alertTemplateText,
  alertTooltipTitle,
  alertSendDisabled,
  onCopy,
  onSendAlertTemplate,
  onApplyReasonFilter,
}: DataOpsBatchHistoryFailureSummaryPanelProps) {
  if (!items.length) {
    return null;
  }

  return (
    <div className={failureSummaryStyles.batchFailureSummaryPanel}>
      <div className={failureSummaryStyles.batchFailureSummaryHead}>
        <div className={failureSummaryStyles.batchFailureSummaryHeadMain}>
          <strong>失败原因聚合（Top 8）</strong>
          <span>基于当前筛选结果统计</span>
        </div>
        <DataOpsFailureSummaryActions
          summaryText={summaryText}
          summaryCopyLabel="失败原因聚合摘要"
          alertTemplateText={alertTemplateText}
          alertTemplateCopyLabel="失败告警模板"
          alertTemplateCopyDisabled={!alertTemplateText}
          alertTooltipTitle={alertTooltipTitle}
          alertSendDisabled={alertSendDisabled}
          onCopy={onCopy}
          onSendAlertTemplate={onSendAlertTemplate}
        />
      </div>
      <div className={failureSummaryStyles.batchFailureSummaryList}>
        {items.map((item) => (
          <button
            key={item.reason}
            type="button"
            className={failureSummaryStyles.batchFailureSummaryItem}
            onClick={() => onApplyReasonFilter(item.reason)}
          >
            <Tag color="red">x{item.count}</Tag>
            <p>{truncateText(item.reason, 120)}</p>
            <span>任务：{truncateText(item.pipelineNames.join(' / '), 120)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
