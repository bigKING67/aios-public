'use client';

import { Button, Tag, type TableColumnsType } from '@lobehub/ui';
import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import {
  STATUS_TAG_TONE,
  formatDateTime,
  formatTokenPreview,
  getNotificationEventTypeLabel,
  getNotificationEventTypeTagTone,
  getNotificationStatusLabel,
  getNotificationTraceSloRiskLevelTone,
  getNotificationTraceSloRiskLevelLabel,
  truncateText,
  type NotificationTraceSloScanRankedItem,
} from './dataops-hub-formatters';
import { DataOpsToneTag } from './dataops-tone-tag';
import batchResultStyles from './dataops-batch-result.module.css';
import pipelineStyles from './dataops-pipeline-table.module.css';

type NotificationChannelNameMap = Map<string, { channelName: string }>;

interface NotificationTraceColumnsOptions {
  notificationChannelMap: NotificationChannelNameMap;
}

interface NotificationTraceSloScanColumnsOptions {
  onOpenRetryGroupTrace: (retryGroupId: string) => void;
}

function renderSloStatusTag(record: NotificationTraceSloScanRankedItem) {
  if (!record.breached) {
    return <DataOpsToneTag tone="success">正常</DataOpsToneTag>;
  }
  if (record.triggeredCount > 0) {
    return <DataOpsToneTag tone="danger">已触发</DataOpsToneTag>;
  }
  if (record.cooldownCount > 0) {
    return <DataOpsToneTag tone="warning">冷却中</DataOpsToneTag>;
  }
  return <DataOpsToneTag tone="warning">已命中</DataOpsToneTag>;
}

export function buildDataOpsRetryGroupTraceColumns({
  notificationChannelMap,
}: NotificationTraceColumnsOptions): TableColumnsType<DataOpsNotificationEvent> {
  return [
    {
      title: '时间',
      dataIndex: 'sentAt',
      key: 'sentAt',
      width: 160,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '通道',
      dataIndex: 'channelId',
      key: 'channelId',
      width: 180,
      render: (value: string) => notificationChannelMap.get(value)?.channelName || value,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: DataOpsNotificationEvent['status']) => (
        <DataOpsToneTag tone={STATUS_TAG_TONE[value]}>{value}</DataOpsToneTag>
      ),
    },
    {
      title: '类型',
      dataIndex: 'eventType',
      key: 'eventType',
      width: 170,
      render: (value: string) => (
        <DataOpsToneTag tone={getNotificationEventTypeTagTone(value)}>
          {getNotificationEventTypeLabel(value)}
        </DataOpsToneTag>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 260,
    },
    {
      title: 'reasonHash',
      dataIndex: 'reasonHash',
      key: 'reasonHash',
      width: 170,
      render: (value: string | undefined) => (
        <span className={pipelineStyles.inlineCode}>
          {value ? formatTokenPreview(value, 12) : '-'}
        </span>
      ),
    },
    {
      title: '明细',
      dataIndex: 'detail',
      key: 'detail',
      render: (value: string) => truncateText(value, 220),
    },
  ];
}

export function buildDataOpsRetryGroupTraceMobileColumns({
  notificationChannelMap,
}: NotificationTraceColumnsOptions): TableColumnsType<DataOpsNotificationEvent> {
  return [
    {
      title: '链路事件',
      key: 'mobile',
      render: (_value, record) => (
        <div className="space-y-2 py-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold text-text-primary">{record.title}</p>
              <p className="m-0 text-xs text-text-tertiary">{formatDateTime(record.sentAt)}</p>
            </div>
            <DataOpsToneTag tone={STATUS_TAG_TONE[record.status]}>{getNotificationStatusLabel(record.status)}</DataOpsToneTag>
          </div>
          <div className="flex flex-wrap gap-1">
            <DataOpsToneTag tone={getNotificationEventTypeTagTone(record.eventType)}>
              {getNotificationEventTypeLabel(record.eventType)}
            </DataOpsToneTag>
            <Tag>
              {notificationChannelMap.get(record.channelId)?.channelName || record.channelId}
            </Tag>
          </div>
          <div className={pipelineStyles.pipelineTextCell}>
            <p>
              <span>reasonHash：</span>
              {record.reasonHash || '-'}
            </p>
            <p>
              <span>明细：</span>
              {truncateText(record.detail, 180)}
            </p>
          </div>
        </div>
      ),
    },
  ];
}

export function buildDataOpsNotificationTraceSloScanColumns({
  onOpenRetryGroupTrace,
}: NotificationTraceSloScanColumnsOptions): TableColumnsType<NotificationTraceSloScanRankedItem> {
  return [
    {
      title: '优先级',
      dataIndex: 'rank',
      key: 'rank',
      width: 86,
    },
    {
      title: '风险',
      key: 'risk',
      width: 150,
      render: (_value, record) => (
        <div className={pipelineStyles.pipelineTextCell}>
          <DataOpsToneTag tone={getNotificationTraceSloRiskLevelTone(record.riskLevel)}>
            {getNotificationTraceSloRiskLevelLabel(record.riskLevel)}
          </DataOpsToneTag>
          <span className={batchResultStyles.batchHistoryStatsText}>分值 {record.riskScore}</span>
        </div>
      ),
    },
    {
      title: 'retryGroupId',
      dataIndex: 'retryGroupId',
      key: 'retryGroupId',
      width: 280,
      render: (value: string) => (
        <div className={pipelineStyles.pipelineTextCell}>
          <span className={pipelineStyles.inlineCode}>{formatTokenPreview(value, 20)}</span>
          <Button
            type="link"
            size="small"
            onClick={() => {
              onOpenRetryGroupTrace(value);
            }}
          >
            查看链路
          </Button>
        </div>
      ),
    },
    {
      title: '最新事件',
      dataIndex: 'latestEventAt',
      key: 'latestEventAt',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '事件数',
      dataIndex: 'eventCount',
      key: 'eventCount',
      width: 100,
    },
    {
      title: '事件来源',
      dataIndex: 'eventSource',
      key: 'eventSource',
      width: 120,
      render: (value: NotificationTraceSloScanRankedItem['eventSource']) => (
        <Tag color={value === 'postgres' ? 'green' : 'gold'}>
          {value === 'postgres' ? 'Postgres' : '运行缓存'}
        </Tag>
      ),
    },
    {
      title: 'SLO状态',
      key: 'breached',
      width: 150,
      render: (_value, record) => renderSloStatusTag(record),
    },
    {
      title: '触发数',
      dataIndex: 'triggeredCount',
      key: 'triggeredCount',
      width: 90,
    },
    {
      title: '冷却数',
      dataIndex: 'cooldownCount',
      key: 'cooldownCount',
      width: 90,
    },
    {
      title: '告警信息',
      dataIndex: 'warning',
      key: 'warning',
      render: (value: string | undefined) => truncateText(value || '-', 180),
    },
  ];
}

export function buildDataOpsNotificationTraceSloScanMobileColumns({
  onOpenRetryGroupTrace,
}: NotificationTraceSloScanColumnsOptions): TableColumnsType<NotificationTraceSloScanRankedItem> {
  return [
    {
      title: '巡检结果',
      key: 'mobile',
      render: (_value, record) => (
        <div className="space-y-2 py-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold text-text-primary">
                #{record.rank} · {formatTokenPreview(record.retryGroupId, 20)}
              </p>
              <p className="m-0 text-xs text-text-tertiary">
                最新事件：{formatDateTime(record.latestEventAt)}
              </p>
            </div>
            <DataOpsToneTag tone={getNotificationTraceSloRiskLevelTone(record.riskLevel)}>
              {getNotificationTraceSloRiskLevelLabel(record.riskLevel)}
            </DataOpsToneTag>
          </div>
          <div className={pipelineStyles.pipelineTextCell}>
            <p>
              <span>风险分值：</span>
              {record.riskScore}
            </p>
            <p>
              <span>事件数：</span>
              {record.eventCount}
            </p>
            <p>
              <span>触发/冷却：</span>
              {record.triggeredCount}/{record.cooldownCount}
            </p>
            <p>
              <span>告警：</span>
              {truncateText(record.warning || '-', 120)}
            </p>
          </div>
          <Button
            type="link"
            size="small"
            onClick={() => {
              onOpenRetryGroupTrace(record.retryGroupId);
            }}
          >
            查看链路
          </Button>
        </div>
      ),
    },
  ];
}
