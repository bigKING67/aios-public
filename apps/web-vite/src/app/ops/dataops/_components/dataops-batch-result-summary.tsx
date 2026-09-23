'use client';

import type { BatchExecutionSummary } from './dataops-batch-helpers';
import { formatDateTime } from './dataops-hub-formatters';
import batchResultStyles from './dataops-batch-result.module.css';

interface DataOpsBatchResultSummaryProps {
  summary: BatchExecutionSummary;
}

export function DataOpsBatchResultSummary({
  summary,
}: DataOpsBatchResultSummaryProps) {
  return (
    <div className={batchResultStyles.batchResultSummary}>
      <span className={batchResultStyles.batchResultMetric}>
        总任务：{summary.totalCount}
      </span>
      <span className={batchResultStyles.batchResultMetric}>
        成功：{summary.successCount}
      </span>
      <span className={batchResultStyles.batchResultMetric}>
        失败：{summary.failedCount}
      </span>
      <span className={batchResultStyles.batchResultMetric}>
        跳过：{summary.skippedCount}
      </span>
      <span className={batchResultStyles.batchResultMetric}>
        时间：{formatDateTime(summary.executedAt)}
      </span>
    </div>
  );
}
