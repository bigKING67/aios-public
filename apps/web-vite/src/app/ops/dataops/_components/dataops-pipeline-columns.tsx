'use client';

import { type ReactNode } from 'react';
import { Button, Table, Tag, Tooltip, type TableColumnsType } from '@lobehub/ui';
import { CirclePause, CirclePlay } from 'lucide-react';
import type { DataOpsActionRequest, DataOpsRuntimePipeline } from '@/types/dataops';
import { DataOpsStatusTag } from './dataops-status-tag';
import {
  DOMAIN_TAG_COLOR,
  formatDateTime,
  truncateText,
} from './dataops-hub-formatters';
import {
  getActionKey,
  getPipelineActionDisabledReason,
} from './dataops-action-helpers';
import { DATAOPS_ICON_PROPS } from './dataops-icon-props';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsPipelineColumnsOptions {
  actionPending: boolean;
  activeActionKey: string | null;
  globalActionBusy: boolean;
  hasOperatePermission: boolean;
  onPipelineAction: (
    pipeline: DataOpsRuntimePipeline,
    action: DataOpsActionRequest['action']
  ) => void;
  onOpenCommandModal: (pipeline: DataOpsRuntimePipeline) => void;
  onOpenTriggerModal: (pipeline: DataOpsRuntimePipeline) => void;
}

function buildPipelineHeaderCellProps() {
  return { className: pipelineStyles.pipelineHeaderCell };
}

function buildPipelineBodyCellProps() {
  return { className: pipelineStyles.pipelineBodyCell };
}

function wrapActionButton(button: ReactNode, disabledReason: string) {
  if (!disabledReason) {
    return button;
  }

  return (
    <Tooltip title={disabledReason}>
      <span className={pipelineStyles.pipelineActionButtonWrap}>{button}</span>
    </Tooltip>
  );
}

export function buildDataOpsPipelineColumns({
  actionPending,
  activeActionKey,
  globalActionBusy,
  hasOperatePermission,
  onPipelineAction,
  onOpenCommandModal,
  onOpenTriggerModal,
}: DataOpsPipelineColumnsOptions): TableColumnsType<DataOpsRuntimePipeline> {
  const expandColumn: TableColumnsType<DataOpsRuntimePipeline>[number] = Table.EXPAND_COLUMN;
  const headerCellProps = buildPipelineHeaderCellProps;
  const bodyCellProps = buildPipelineBodyCellProps;

  return [
    expandColumn,
    {
      title: <span className={pipelineStyles.pipelineColumnTitle}>任务</span>,
      dataIndex: 'name',
      key: 'name',
      width: 280,
      fixed: 'left',
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      render: (_value, record) => (
        <div className={pipelineStyles.pipelineTaskCell}>
          <div className={pipelineStyles.pipelineHead}>
            <Tooltip title={record.name || undefined}>
              <strong>{record.name}</strong>
            </Tooltip>
            <Tag color={DOMAIN_TAG_COLOR[record.domain]}>
              {record.domain}
            </Tag>
          </div>
          <p className={pipelineStyles.pipelineSecondaryText}>
            水位表：{record.watermarkTable || '无'}
          </p>
        </div>
      ),
    },
    {
      title: <span className={pipelineStyles.pipelineColumnTitle}>状态</span>,
      key: 'status',
      width: 230,
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      render: (_value, record) => {
        const flowStatusText =
          record.runtime?.flowRunStateName || record.runtime?.flowRunStateType || '';
        const operationError = record.runtime?.operationError?.trim() || '';
        const errorSummary = operationError
          ? truncateText(operationError.replace(/\s+/g, ' '), 44)
          : '';

        return (
          <div className={pipelineStyles.pipelineStatusCell}>
            <div className={pipelineStyles.pipelineStatusRow}>
              <DataOpsStatusTag status={record.status} />
              <span className={pipelineStyles.durationText}>
                平均耗时 {Number.isFinite(record.avgDurationSec) ? `${record.avgDurationSec}s` : '-'}
              </span>
            </div>
            {flowStatusText && flowStatusText !== '-' ? (
              <p className={pipelineStyles.pipelineSecondaryText}>Flow状态：{flowStatusText}</p>
            ) : null}
            {operationError ? (
              <Tooltip title={operationError}>
                <p className={pipelineStyles.pipelineErrorSummary}>错误：{errorSummary}</p>
              </Tooltip>
            ) : null}
          </div>
        );
      },
    },
    {
      title: <span className={pipelineStyles.pipelineColumnTitle}>最近执行</span>,
      key: 'runtime',
      width: 260,
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      render: (_value, record) => (
        <div className={pipelineStyles.pipelineRecentCell}>
          <p>
            <span>最近执行</span>
            <strong>{formatDateTime(record.runtime?.flowRunAt || record.lastRunAt)}</strong>
          </p>
          <p>
            <span>最近成功</span>
            <strong>{formatDateTime(record.lastSuccessAt)}</strong>
          </p>
        </div>
      ),
    },
    {
      title: <span className={pipelineStyles.pipelineColumnTitle}>操作</span>,
      key: 'actions',
      width: 232,
      fixed: 'right',
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      render: (_value, record) => {
        const hasDeployment = Boolean(record.runtime?.deploymentId);
        const toggleAction: DataOpsActionRequest['action'] =
          record.runtime?.deploymentPaused ? 'resume_deployment' : 'pause_deployment';
        const disabledReason = getPipelineActionDisabledReason({
          hasOperatePermission,
          globalActionBusy,
          hasDeployment,
        });
        const shouldDisableAction = Boolean(disabledReason);

        const triggerKey = getActionKey('trigger_pipeline', record.id);
        const toggleKey = getActionKey(toggleAction, record.id);

        const isTriggerLoading = actionPending && activeActionKey === triggerKey;
        const isToggleLoading = actionPending && activeActionKey === toggleKey;

        return (
          <div className={pipelineStyles.pipelineMainActionGroup}>
            {wrapActionButton(
              <Button
                size="small"
                type="primary"
                block
                icon={<CirclePlay {...DATAOPS_ICON_PROPS} />}
                loading={isTriggerLoading}
                disabled={shouldDisableAction}
                onClick={() => onPipelineAction(record, 'trigger_pipeline')}
              >
                立即运行
              </Button>,
              disabledReason
            )}
            {wrapActionButton(
              <Button
                size="small"
                block
                icon={<CirclePause {...DATAOPS_ICON_PROPS} />}
                loading={isToggleLoading}
                disabled={shouldDisableAction}
                onClick={() => onPipelineAction(record, toggleAction)}
              >
                {record.runtime?.deploymentPaused ? '恢复调度' : '暂停调度'}
              </Button>,
              disabledReason
            )}
            {wrapActionButton(
              <Button
                size="small"
                block
                disabled={shouldDisableAction}
                onClick={() => onOpenTriggerModal(record)}
              >
                参数触发
              </Button>,
              disabledReason
            )}
            <Button
              size="small"
              block
              onClick={() => onOpenCommandModal(record)}
            >
              Linux命令
            </Button>
          </div>
        );
      },
    },
  ];
}
