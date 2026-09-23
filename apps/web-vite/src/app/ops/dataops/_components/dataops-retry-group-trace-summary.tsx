'use client';

import { Alert } from 'antd';
import type { DataOpsNotificationTraceSloStatus, DataOpsNotificationTraceSummary } from '@/types/dataops';
import { formatDateTime } from './dataops-hub-formatters';
import batchStyles from './dataops-batch-controls.module.css';
import batchResultStyles from './dataops-batch-result.module.css';
import shellStyles from './dataops-shell.module.css';

type RetryGroupTraceSource = 'postgres' | 'runtime_store';

interface DataOpsRetryGroupTraceSummaryProps {
  retryGroupId: string;
  summary: DataOpsNotificationTraceSummary | null;
  filteredEventCount: number;
  isFetching: boolean;
  errorMessage: string | null;
  source: RetryGroupTraceSource | null;
  sloStatus: DataOpsNotificationTraceSloStatus | null;
  sloDescription: string;
}

export function DataOpsRetryGroupTraceSummary({
  retryGroupId,
  summary,
  filteredEventCount,
  isFetching,
  errorMessage,
  source,
  sloStatus,
  sloDescription,
}: DataOpsRetryGroupTraceSummaryProps) {
  return (
    <>
      <div className={batchResultStyles.batchResultSummary}>
        <span className={batchResultStyles.batchResultMetric}>
          事件总数：{summary?.totalCount || 0}
        </span>
        <span className={batchResultStyles.batchResultMetric}>
          当前视图：{filteredEventCount}
        </span>
        <span className={batchResultStyles.batchResultMetric}>
          成功：{summary?.sentCount || 0}
        </span>
        <span className={batchResultStyles.batchResultMetric}>
          失败：{summary?.failedCount || 0}
        </span>
        <span className={batchResultStyles.batchResultMetric}>
          跳过：{summary?.skippedCount || 0}
        </span>
        <span className={batchResultStyles.batchResultMetric}>
          可重发失败：{summary?.retryableFailedCount || 0}
        </span>
      </div>
      <p className={batchStyles.batchSummaryInfo}>
        链路ID：{retryGroupId} · 通道：
        {summary?.channelNames.length ? summary.channelNames.join(' / ') : '无'} · 时间范围：
        {formatDateTime(summary?.earliestAt)} {'->'} {formatDateTime(summary?.latestAt)}
      </p>
      {isFetching ? (
        <Alert
          type="info"
          showIcon
          title="正在同步链路事件"
          description="优先从后端按 retryGroupId 读取链路数据与聚合结果。"
          className={shellStyles.riskAlert}
        />
      ) : null}
      {errorMessage ? (
        <Alert
          type="warning"
          showIcon
          title="链路后端查询失败，已回退本地过滤结果"
          description={errorMessage}
          className={shellStyles.riskAlert}
        />
      ) : null}
      {source ? (
        <p className={batchResultStyles.batchHistoryStatsText}>
          链路数据源：{source === 'postgres' ? 'Postgres 索引查询' : '运行态缓存过滤'}
        </p>
      ) : null}
      {sloStatus ? (
        <Alert
          type={
            !sloStatus.enabled
              ? 'info'
              : sloStatus.breached && sloStatus.items.some((item) => item.triggered)
                ? 'error'
                : sloStatus.breached
                  ? 'warning'
                  : 'success'
          }
          showIcon
          title={
            !sloStatus.enabled
              ? '通知链路SLO监控已关闭'
              : sloStatus.breached && sloStatus.items.some((item) => item.triggered)
                ? `通知链路SLO已触发 (${sloStatus.items.filter((item) => item.triggered).length})`
                : sloStatus.breached
                  ? '通知链路SLO命中（冷却中）'
                  : '通知链路SLO正常'
          }
          description={sloDescription}
          className={shellStyles.riskAlert}
        />
      ) : null}
    </>
  );
}
