'use client';

import type { DataOpsNotificationTraceSloScanResponse } from '@/types/dataops';
import type { NotificationTraceSloScanRiskSummary } from './dataops-notification-retry-helpers';
import batchResultStyles from './dataops-batch-result.module.css';

interface DataOpsNotificationTraceSloScanSummaryProps {
  result: DataOpsNotificationTraceSloScanResponse;
  riskSummary: NotificationTraceSloScanRiskSummary;
}

export function DataOpsNotificationTraceSloScanSummary({
  result,
  riskSummary,
}: DataOpsNotificationTraceSloScanSummaryProps) {
  return (
    <div className={batchResultStyles.batchResultSummary}>
      <span className={batchResultStyles.batchResultMetric}>
        执行时间：{result.executedAt}
      </span>
      <span className={batchResultStyles.batchResultMetric}>
        处理分组：{result.processedGroups}
      </span>
      <span className={batchResultStyles.batchResultMetric}>
        命中分组：{result.breachedGroups}
      </span>
      <span className={batchResultStyles.batchResultMetric}>
        触发分组：{result.triggeredGroups}
      </span>
      <span className={batchResultStyles.batchResultMetric}>
        扫描并发：{result.scanConcurrency}
      </span>
      <span className={batchResultStyles.batchResultMetric}>耗时：{result.durationMs}ms</span>
      <span className={batchResultStyles.batchResultMetric}>
        分组来源：{result.groupSource === 'postgres' ? 'Postgres' : '运行缓存'}
      </span>
      <span className={batchResultStyles.batchResultMetric}>
        风险分布：高{riskSummary.critical} / 中{riskSummary.warning} / 关注
        {riskSummary.watch}
      </span>
    </div>
  );
}
