'use client';

import { Tag } from 'antd';
import type { DataOpsNotificationTraceReasonHashRecoveryItem } from '@/types/dataops';
import type { NotificationTraceReasonHashRecoverySummary } from './dataops-notification-retry-helpers';
import {
  MISSING_REASON_HASH_KEY,
  formatTokenPreview,
  normalizeToken,
} from './dataops-hub-formatters';
import batchResultStyles from './dataops-batch-result.module.css';
import pipelineStyles from './dataops-pipeline-table.module.css';
import traceReasonHashStyles from './dataops-trace-reason-hash.module.css';

interface DataOpsTraceReasonHashRecoveryPanelProps {
  items: DataOpsNotificationTraceReasonHashRecoveryItem[];
  summary: NotificationTraceReasonHashRecoverySummary | null;
  activeReasonHashFocus: string;
  onFocusReasonHash: (reasonHashKey: string) => void;
}

export function DataOpsTraceReasonHashRecoveryPanel({
  items,
  summary,
  activeReasonHashFocus,
  onFocusReasonHash,
}: DataOpsTraceReasonHashRecoveryPanelProps) {
  if (!items.length) {
    return null;
  }

  return (
    <div className={traceReasonHashStyles.traceReasonHashPanel}>
      <div className={traceReasonHashStyles.traceReasonHashHead}>
        <div className={traceReasonHashStyles.traceReasonHashHeadMain}>
          <strong>reasonHash 恢复率（按首次失败链路）</strong>
          <span>点击条目可一键筛选当前链路明细，聚焦同类失败。</span>
        </div>
        <span className={batchResultStyles.batchHistoryStatsText}>
          首次失败 {summary?.firstFailedCount || 0} · 后续成功 {summary?.recoveredCount || 0} · 仍失败{' '}
          {summary?.unresolvedCount || 0} · 恢复率 {summary?.recoveryRate || 0}%
        </span>
      </div>
      <div className={traceReasonHashStyles.traceReasonHashGrid}>
        {items.map((item) => {
          const reasonLabel =
            item.reasonHashKey === MISSING_REASON_HASH_KEY
              ? '缺失reasonHash'
              : item.reasonHashLabel;
          const isActive = normalizeToken(item.reasonHashKey) === activeReasonHashFocus;

          return (
            <button
              key={item.reasonHashKey}
              type="button"
              className={`${traceReasonHashStyles.traceReasonHashItem} ${
                isActive ? traceReasonHashStyles.traceReasonHashItemActive : ''
              }`}
              onClick={() => onFocusReasonHash(item.reasonHashKey)}
            >
              <div className={traceReasonHashStyles.traceReasonHashItemHead}>
                <span className={pipelineStyles.inlineCode}>
                  {item.reasonHashKey === MISSING_REASON_HASH_KEY
                    ? reasonLabel
                    : formatTokenPreview(reasonLabel, 16)}
                </span>
                <Tag
                  color={
                    item.recoveryRate >= 80 ? 'green' : item.recoveryRate >= 50 ? 'gold' : 'red'
                  }
                >
                  {item.recoveryRate}%
                </Tag>
              </div>
              <p className={traceReasonHashStyles.traceReasonHashMetric}>
                首次失败 {item.firstFailedCount} · 后续成功 {item.recoveredCount} · 仍失败{' '}
                {item.unresolvedCount}
              </p>
              <span className={traceReasonHashStyles.traceReasonHashHint}>
                {item.sampleReason || '暂无失败明细'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
