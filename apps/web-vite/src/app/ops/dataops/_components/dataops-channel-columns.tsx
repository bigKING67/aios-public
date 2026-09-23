'use client';

import { Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import { DataOpsStatusTag } from './dataops-status-tag';
import {
  formatDateTime,
  getNotificationChannelRoleLabel,
  getNotificationChannelUsageHint,
} from './dataops-hub-formatters';
import { getActionKey } from './dataops-action-helpers';
import styles from './dataops-hub.module.css';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsChannelColumnsOptions {
  actionPending: boolean;
  activeActionKey: string | null;
  globalActionBusy: boolean;
  hasOperatePermission: boolean;
  onChannelWebhookTest: (channel: DataOpsNotificationChannel) => void;
  onOpenChannelManualNotifyModal: (channel: DataOpsNotificationChannel) => void;
}

function renderChannelIdentity(channel: DataOpsNotificationChannel, channelName = channel.channelName) {
  return (
    <div className={styles.channelNameCell}>
      <div className={styles.channelNameHead}>
        <p className={styles.channelNameTitle}>{channelName}</p>
        <span className={styles.channelRoleTag}>
          {getNotificationChannelRoleLabel(channel.id)}
        </span>
      </div>
      <p className={styles.channelUsageHint}>{getNotificationChannelUsageHint(channel.id)}</p>
      <p className={styles.channelNameMeta}>
        {channel.provider.toUpperCase()} / {channel.protocol.toUpperCase()}
      </p>
    </div>
  );
}

function renderFailureCountTag(value: number) {
  if (value >= 3) {
    return <Tag color="red">{value}</Tag>;
  }
  if (value > 0) {
    return <Tag color="gold">{value}</Tag>;
  }
  return <Tag color="green">0</Tag>;
}

export function buildDataOpsChannelColumns({
  actionPending,
  activeActionKey,
  globalActionBusy,
  hasOperatePermission,
  onChannelWebhookTest,
  onOpenChannelManualNotifyModal,
}: DataOpsChannelColumnsOptions): ColumnsType<DataOpsNotificationChannel> {
  return [
    {
      title: '通道',
      dataIndex: 'channelName',
      key: 'channelName',
      width: 300,
      render: (value: string, record) => renderChannelIdentity(record, value),
    },
    {
      title: 'Endpoint',
      dataIndex: 'endpointMasked',
      key: 'endpointMasked',
      width: 270,
      render: (value: string) => <span className={styles.channelEndpointCode}>{value}</span>,
    },
    {
      title: '重试策略',
      dataIndex: 'retryPolicy',
      key: 'retryPolicy',
      width: 180,
    },
    {
      title: '最近送达',
      dataIndex: 'lastDeliveredAt',
      key: 'lastDeliveredAt',
      width: 170,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: '24h失败',
      dataIndex: 'failureCount24h',
      key: 'failureCount24h',
      width: 118,
      align: 'center',
      render: (value: number) => renderFailureCountTag(value),
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_value, record) => <DataOpsStatusTag status={record.status} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_value, record) => {
        const actionKey = getActionKey('test_channel_webhook', record.id);
        const isLoading = actionPending && activeActionKey === actionKey;
        const shouldDisable = !record.enabled || globalActionBusy || !hasOperatePermission;

        return (
          <div className={pipelineStyles.pipelineActionGroup}>
            <Button
              size="small"
              loading={isLoading}
              disabled={shouldDisable}
              onClick={() => onChannelWebhookTest(record)}
            >
              测试Webhook
            </Button>
            <Button
              size="small"
              disabled={shouldDisable}
              onClick={() => onOpenChannelManualNotifyModal(record)}
            >
              手动发送
            </Button>
          </div>
        );
      },
    },
  ];
}

export function buildDataOpsChannelMobileColumns({
  actionPending,
  activeActionKey,
  globalActionBusy,
  hasOperatePermission,
  onChannelWebhookTest,
  onOpenChannelManualNotifyModal,
}: DataOpsChannelColumnsOptions): ColumnsType<DataOpsNotificationChannel> {
  return [
    {
      title: '通知通道',
      key: 'mobile',
      render: (_value, record) => {
        const actionKey = getActionKey('test_channel_webhook', record.id);
        const isLoading = actionPending && activeActionKey === actionKey;
        const shouldDisable = !record.enabled || globalActionBusy || !hasOperatePermission;

        return (
          <div className="space-y-2 py-1">
            <div className="flex items-start justify-between gap-2">
              {renderChannelIdentity(record)}
              <DataOpsStatusTag status={record.status} />
            </div>
            <div className={pipelineStyles.pipelineTextCell}>
              <p>
                <span>Endpoint：</span>
                {record.endpointMasked}
              </p>
              <p>
                <span>重试策略：</span>
                {record.retryPolicy}
              </p>
              <p>
                <span>最近送达：</span>
                {formatDateTime(record.lastDeliveredAt)}
              </p>
              <p>
                <span>24h失败：</span>
                {record.failureCount24h}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                loading={isLoading}
                disabled={shouldDisable}
                onClick={() => onChannelWebhookTest(record)}
              >
                测试Webhook
              </Button>
              <Button
                size="small"
                disabled={shouldDisable}
                onClick={() => onOpenChannelManualNotifyModal(record)}
              >
                手动发送
              </Button>
            </div>
          </div>
        );
      },
    },
  ];
}
