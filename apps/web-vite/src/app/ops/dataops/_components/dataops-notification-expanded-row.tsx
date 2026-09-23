'use client';

import { Tooltip } from 'antd';
import type { DataOpsNotificationChannel, DataOpsNotificationEvent } from '@/config/dataops-hub';
import { DataOpsNotificationLinkIndex } from './dataops-notification-link-index';
import { getNotificationEventTypeLabel } from './dataops-hub-formatters';
import notificationTableStyles from './dataops-notification-table.module.css';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsNotificationExpandedRowProps {
  record: DataOpsNotificationEvent;
  notificationChannelMap: Map<string, DataOpsNotificationChannel>;
  onApplyReasonHashFilter: (reasonHash: string) => void;
  onApplyRetryGroupFilter: (retryGroupId: string) => void;
  onOpenRetryGroupTrace: (retryGroupId: string) => void;
  onCopy: (text: string, label: string) => Promise<void>;
}

export function DataOpsNotificationExpandedRow({
  record,
  notificationChannelMap,
  onApplyReasonHashFilter,
  onApplyRetryGroupFilter,
  onOpenRetryGroupTrace,
  onCopy,
}: DataOpsNotificationExpandedRowProps) {
  const reasonHash = (record.reasonHash || '').trim();
  const retryGroupId = (record.retryGroupId || '').trim();
  const channelLabel = notificationChannelMap.get(record.channelId)?.channelName || record.channelId;

  return (
    <div className={notificationTableStyles.notificationExpandPanel}>
      <div className={pipelineStyles.pipelineExpandGrid}>
        <section className={pipelineStyles.pipelineExpandSection}>
          <h4>通知详情</h4>
          <div className={pipelineStyles.pipelineKvList}>
            <div className={pipelineStyles.pipelineKvItem}>
              <span className={pipelineStyles.pipelineKvLabel}>通道</span>
              <span className={pipelineStyles.pipelineKvValue}>{channelLabel}</span>
            </div>
            <div className={pipelineStyles.pipelineKvItem}>
              <span className={pipelineStyles.pipelineKvLabel}>级别</span>
              <span className={pipelineStyles.pipelineKvValue}>{record.level.toUpperCase()}</span>
            </div>
            <div className={pipelineStyles.pipelineKvItem}>
              <span className={pipelineStyles.pipelineKvLabel}>事件类型</span>
              <span className={pipelineStyles.pipelineKvValue}>
                {getNotificationEventTypeLabel(record.eventType)}
              </span>
            </div>
            <div className={pipelineStyles.pipelineKvItem}>
              <span className={pipelineStyles.pipelineKvLabel}>Flow</span>
              <Tooltip title={record.flowName}>
                <span className={pipelineStyles.pipelineKvValue}>{record.flowName}</span>
              </Tooltip>
            </div>
            <div className={pipelineStyles.pipelineKvItem}>
              <span className={pipelineStyles.pipelineKvLabel}>目标表</span>
              <Tooltip title={record.targetTable}>
                <span className={pipelineStyles.pipelineKvValue}>{record.targetTable || '-'}</span>
              </Tooltip>
            </div>
            <div className={pipelineStyles.pipelineKvItem}>
              <span className={pipelineStyles.pipelineKvLabel}>明细</span>
              <p className={notificationTableStyles.notificationDetailText}>{record.detail || '-'}</p>
            </div>
          </div>
        </section>

        <DataOpsNotificationLinkIndex
          reasonHash={reasonHash}
          retryGroupId={retryGroupId}
          onApplyReasonHashFilter={onApplyReasonHashFilter}
          onApplyRetryGroupFilter={onApplyRetryGroupFilter}
          onOpenRetryGroupTrace={onOpenRetryGroupTrace}
          onCopy={onCopy}
        />
      </div>
    </div>
  );
}
