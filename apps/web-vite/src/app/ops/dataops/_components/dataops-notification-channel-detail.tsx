'use client';

import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import notifyStyles from './dataops-notify-panel.module.css';
import styles from './dataops-hub.module.css';

export interface DataOpsNotificationChannelSummary {
  totalCount: number;
  activeCount: number;
  pausedCount: number;
  riskCount: number;
  failureCount24h: number;
}

interface DataOpsNotificationChannelDetailProps {
  channels: DataOpsNotificationChannel[];
  summary: DataOpsNotificationChannelSummary;
  defaultAlertChannelName: string | null;
  columns: ColumnsType<DataOpsNotificationChannel>;
  isCompactViewport: boolean;
  renderPaginationTotal: (total: number, range: [number, number]) => string;
}

export function DataOpsNotificationChannelDetail({
  channels,
  summary,
  defaultAlertChannelName,
  columns,
  isCompactViewport,
  renderPaginationTotal,
}: DataOpsNotificationChannelDetailProps) {
  return (
    <article className={notifyStyles.panel}>
      <div className={notifyStyles.panelHead}>
        <h3>Webhook 通道</h3>
        <p>统一管理飞书通知目标、重试策略与健康状态。</p>
      </div>
      <div className={notifyStyles.webhookSummaryRail}>
        <span className={styles.notifyDataBadge}>机器人 {summary.totalCount}</span>
        <span className={styles.notifyDataBadge}>可用 {summary.activeCount}</span>
        <span className={styles.notifyDataBadge}>停用 {summary.pausedCount}</span>
        <span className={styles.notifyDataBadge}>风险 {summary.riskCount}</span>
        <span className={styles.notifyDataBadge}>24h失败 {summary.failureCount24h}</span>
        <span className={notifyStyles.webhookSummaryHint}>
          默认发送：{defaultAlertChannelName || '未配置'}
        </span>
      </div>
      <Table<DataOpsNotificationChannel>
        rowKey="id"
        columns={columns}
        dataSource={channels}
        pagination={{
          defaultPageSize: 6,
          pageSizeOptions: ['6', '10', '20'],
          showSizeChanger: true,
          hideOnSinglePage: true,
          showTotal: renderPaginationTotal,
        }}
        size="small"
        scroll={isCompactViewport ? undefined : { x: 'max-content' }}
      />
    </article>
  );
}
