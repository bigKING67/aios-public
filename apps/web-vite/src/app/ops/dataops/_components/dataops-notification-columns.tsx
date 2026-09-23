'use client';

import { Button, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type {
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
} from '@/config/dataops-hub';
import { DataOpsNotificationLinkIndex } from './dataops-notification-link-index';
import {
  LEVEL_TAG_COLOR,
  STATUS_TAG_COLOR,
  formatDateTime,
  getNotificationEventTypeLabel,
  getNotificationEventTypeTagColor,
  getNotificationStatusLabel,
  truncateText,
} from './dataops-hub-formatters';
import notificationTableStyles from './dataops-notification-table.module.css';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsNotificationColumnsOptions {
  availableAlertChannels: DataOpsNotificationChannel[];
  globalActionBusy: boolean;
  hasOperatePermission: boolean;
  onOpenNotificationEventRetryModal: (event: DataOpsNotificationEvent) => void;
}

interface DataOpsNotificationMobileColumnsOptions extends DataOpsNotificationColumnsOptions {
  onApplyReasonHashFilter: (reasonHash: string) => void;
  onApplyRetryGroupFilter: (retryGroupId: string) => void;
  onOpenRetryGroupTrace: (retryGroupId: string) => void;
  onCopy: (text: string, label: string) => Promise<void>;
}

function buildNotificationHeaderCellProps() {
  return { className: notificationTableStyles.notificationHeaderCell };
}

function buildNotificationBodyCellProps() {
  return { className: notificationTableStyles.notificationBodyCell };
}

function renderNotificationColumnTitle(title: string) {
  return (
    <span className={notificationTableStyles.notificationColumnTitle}>
      {title}
    </span>
  );
}

function isRetryActionDisabled({
  record,
  availableAlertChannels,
  globalActionBusy,
  hasOperatePermission,
}: {
  record: DataOpsNotificationEvent;
  availableAlertChannels: DataOpsNotificationChannel[];
  globalActionBusy: boolean;
  hasOperatePermission: boolean;
}) {
  const channelReady = availableAlertChannels.some((item) => item.id === record.channelId);
  return (
    !hasOperatePermission ||
    globalActionBusy ||
    record.status !== 'failed' ||
    !channelReady
  );
}

export function buildDataOpsNotificationColumns({
  availableAlertChannels,
  globalActionBusy,
  hasOperatePermission,
  onOpenNotificationEventRetryModal,
}: DataOpsNotificationColumnsOptions): ColumnsType<DataOpsNotificationEvent> {
  const expandColumn: ColumnsType<DataOpsNotificationEvent>[number] = Table.EXPAND_COLUMN;
  const headerCellProps = buildNotificationHeaderCellProps;
  const bodyCellProps = buildNotificationBodyCellProps;

  return [
    expandColumn,
    {
      title: renderNotificationColumnTitle('通知'),
      key: 'notification',
      width: 380,
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      render: (_value, record) => (
        <div className={notificationTableStyles.notificationTitleCell}>
          <Tooltip title={record.title}>
            <p className={notificationTableStyles.notificationTitleText}>{record.title}</p>
          </Tooltip>
          <div className={notificationTableStyles.notificationMetaRow}>
            <Tag color={LEVEL_TAG_COLOR[record.level]}>{record.level.toUpperCase()}</Tag>
            <Tag color={getNotificationEventTypeTagColor(record.eventType)}>
              {getNotificationEventTypeLabel(record.eventType)}
            </Tag>
            <Tooltip title={record.targetTable}>
              <span className={notificationTableStyles.notificationTargetText}>
                目标表：{record.targetTable}
              </span>
            </Tooltip>
          </div>
        </div>
      ),
    },
    {
      title: renderNotificationColumnTitle('发送状态'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      render: (value: DataOpsNotificationEvent['status']) => (
        <Tag color={STATUS_TAG_COLOR[value]}>{value}</Tag>
      ),
    },
    {
      title: renderNotificationColumnTitle('时间'),
      dataIndex: 'sentAt',
      key: 'sentAt',
      width: 160,
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: renderNotificationColumnTitle('操作'),
      key: 'action',
      width: 96,
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      render: (_value, record) => {
        const shouldDisable = isRetryActionDisabled({
          record,
          availableAlertChannels,
          globalActionBusy,
          hasOperatePermission,
        });

        return (
          <Button
            size="small"
            disabled={shouldDisable}
            onClick={() => onOpenNotificationEventRetryModal(record)}
          >
            失败重发
          </Button>
        );
      },
    },
  ];
}

export function buildDataOpsNotificationMobileColumns({
  availableAlertChannels,
  globalActionBusy,
  hasOperatePermission,
  onApplyReasonHashFilter,
  onApplyRetryGroupFilter,
  onCopy,
  onOpenNotificationEventRetryModal,
  onOpenRetryGroupTrace,
}: DataOpsNotificationMobileColumnsOptions): ColumnsType<DataOpsNotificationEvent> {
  const headerCellProps = buildNotificationHeaderCellProps;
  const bodyCellProps = buildNotificationBodyCellProps;

  return [
    {
      title: renderNotificationColumnTitle('通知记录'),
      key: 'mobile',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      render: (_value, record) => {
        const reasonHash = (record.reasonHash || '').trim();
        const retryGroupId = (record.retryGroupId || '').trim();
        const shouldDisable = isRetryActionDisabled({
          record,
          availableAlertChannels,
          globalActionBusy,
          hasOperatePermission,
        });

        return (
          <div className="space-y-2 py-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold text-text-primary">{record.title}</p>
                <p className="m-0 text-xs text-text-tertiary">
                  时间：{formatDateTime(record.sentAt)}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <Tag color={LEVEL_TAG_COLOR[record.level]}>{record.level.toUpperCase()}</Tag>
                <Tag color={STATUS_TAG_COLOR[record.status]}>
                  {getNotificationStatusLabel(record.status)}
                </Tag>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              <Tag color={getNotificationEventTypeTagColor(record.eventType)}>
                {getNotificationEventTypeLabel(record.eventType)}
              </Tag>
            </div>
            <div className={pipelineStyles.pipelineTextCell}>
              <p>
                <span>目标表：</span>
                {record.targetTable}
              </p>
              <p>
                <span>Flow：</span>
                {record.flowName}
              </p>
              <p>
                <span>明细：</span>
                {truncateText(record.detail, 180)}
              </p>
            </div>
            <DataOpsNotificationLinkIndex
              reasonHash={reasonHash}
              retryGroupId={retryGroupId}
              variant="compact"
              onApplyReasonHashFilter={onApplyReasonHashFilter}
              onApplyRetryGroupFilter={onApplyRetryGroupFilter}
              onOpenRetryGroupTrace={onOpenRetryGroupTrace}
              onCopy={onCopy}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                disabled={shouldDisable}
                onClick={() => onOpenNotificationEventRetryModal(record)}
              >
                失败重发
              </Button>
            </div>
          </div>
        );
      },
    },
  ];
}
