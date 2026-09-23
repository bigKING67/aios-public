'use client';

import { Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  formatDateTime,
  getBatchActionText,
} from './dataops-hub-formatters';
import {
  buildFailureContextFromSummary,
  resolveFailedPipelineIdsFromSummary,
  type BatchExecutionResultItem,
  type BatchExecutionSummary,
  type BatchOperationFailureContext,
} from './dataops-batch-helpers';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsBatchColumnsOptions {
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  onViewBatchResult: (
    summary: BatchExecutionSummary,
    failureContext: BatchOperationFailureContext | null
  ) => void;
  onRetryBatchHistory: (
    summary: BatchExecutionSummary,
    options: { retryableOnly: boolean }
  ) => void | Promise<void>;
}

const BATCH_RESULT_STATUS_COLOR: Record<BatchExecutionResultItem['status'], string> = {
  success: 'green',
  failed: 'red',
  skipped: 'default',
};

const BATCH_RESULT_STATUS_TEXT: Record<BatchExecutionResultItem['status'], string> = {
  success: '成功',
  failed: '失败',
  skipped: '跳过',
};

export function buildDataOpsBatchResultColumns(): ColumnsType<BatchExecutionResultItem> {
  return [
    {
      title: '任务',
      dataIndex: 'pipelineName',
      key: 'pipelineName',
      width: 240,
    },
    {
      title: '结果',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: BatchExecutionResultItem['status']) => (
        <Tag color={BATCH_RESULT_STATUS_COLOR[value]}>{BATCH_RESULT_STATUS_TEXT[value]}</Tag>
      ),
    },
    {
      title: '可重试',
      key: 'retryable',
      width: 110,
      render: (_value, record) => (
        <Tag color={record.retryable ? 'processing' : 'default'}>
          {record.retryable ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
    },
  ];
}

export function buildDataOpsBatchResultMobileColumns(): ColumnsType<BatchExecutionResultItem> {
  return [
    {
      title: '批量结果',
      key: 'mobile',
      render: (_value, record) => (
        <div className="space-y-2 py-1">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 text-sm font-semibold text-text-primary">{record.pipelineName}</p>
            <Tag color={BATCH_RESULT_STATUS_COLOR[record.status]}>
              {BATCH_RESULT_STATUS_TEXT[record.status]}
            </Tag>
          </div>
          <div className="flex flex-wrap gap-2">
            <Tag color={record.retryable ? 'processing' : 'default'}>
              {record.retryable ? '可重试' : '不可重试'}
            </Tag>
          </div>
          <p className="m-0 break-words text-xs text-text-secondary">{record.message}</p>
        </div>
      ),
    },
  ];
}

export function buildDataOpsBatchHistoryColumns({
  hasOperatePermission,
  globalActionBusy,
  onViewBatchResult,
  onRetryBatchHistory,
}: DataOpsBatchColumnsOptions): ColumnsType<BatchExecutionSummary> {
  return [
    {
      title: '时间',
      dataIndex: 'executedAt',
      key: 'executedAt',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '动作',
      key: 'action',
      width: 120,
      render: (_value, record) => <Tag color="blue">{getBatchActionText(record.action)}</Tag>,
    },
    {
      title: '批次名称',
      dataIndex: 'label',
      key: 'label',
      width: 190,
    },
    {
      title: '执行人',
      dataIndex: 'operator',
      key: 'operator',
      width: 150,
      render: (value?: string) => value || '-',
    },
    {
      title: '结果',
      key: 'summary',
      width: 200,
      render: (_value, record) => (
        <span>
          成功 {record.successCount} / 失败 {record.failedCount} / 跳过 {record.skippedCount}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'operation',
      width: 260,
      render: (_value, record) => {
        const failedPipelineIds = resolveFailedPipelineIdsFromSummary(record, {
          retryableOnly: false,
        });
        const retryableFailedPipelineIds = resolveFailedPipelineIdsFromSummary(record, {
          retryableOnly: true,
        });

        return (
          <div className={pipelineStyles.pipelineActionGroup}>
            <Button
              size="small"
              onClick={() => {
                onViewBatchResult(record, buildFailureContextFromSummary(record));
              }}
            >
              查看
            </Button>
            <Button
              size="small"
              disabled={!hasOperatePermission || globalActionBusy || failedPipelineIds.length === 0}
              onClick={() => {
                void onRetryBatchHistory(record, { retryableOnly: false });
              }}
            >
              重试失败{failedPipelineIds.length > 0 ? `(${failedPipelineIds.length})` : ''}
            </Button>
            <Button
              size="small"
              disabled={
                !hasOperatePermission ||
                globalActionBusy ||
                retryableFailedPipelineIds.length === 0
              }
              onClick={() => {
                void onRetryBatchHistory(record, { retryableOnly: true });
              }}
            >
              重试可重试
              {retryableFailedPipelineIds.length > 0
                ? `(${retryableFailedPipelineIds.length})`
                : ''}
            </Button>
          </div>
        );
      },
    },
  ];
}

export function buildDataOpsBatchHistoryMobileColumns({
  hasOperatePermission,
  globalActionBusy,
  onViewBatchResult,
  onRetryBatchHistory,
}: DataOpsBatchColumnsOptions): ColumnsType<BatchExecutionSummary> {
  return [
    {
      title: '批量历史',
      key: 'mobile',
      render: (_value, record) => {
        const failedPipelineIds = resolveFailedPipelineIdsFromSummary(record, {
          retryableOnly: false,
        });
        const retryableFailedPipelineIds = resolveFailedPipelineIdsFromSummary(record, {
          retryableOnly: true,
        });

        return (
          <div className="space-y-2 py-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold text-text-primary">{record.label}</p>
                <p className="m-0 text-xs text-text-tertiary">
                  {formatDateTime(record.executedAt)} · 执行人 {record.operator || '-'}
                </p>
              </div>
              <Tag color="blue">{getBatchActionText(record.action)}</Tag>
            </div>
            <p className="m-0 text-xs text-text-secondary">
              成功 {record.successCount} / 失败 {record.failedCount} / 跳过 {record.skippedCount}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                onClick={() => {
                  onViewBatchResult(record, buildFailureContextFromSummary(record));
                }}
              >
                查看
              </Button>
              <Button
                size="small"
                disabled={!hasOperatePermission || globalActionBusy || failedPipelineIds.length === 0}
                onClick={() => {
                  void onRetryBatchHistory(record, { retryableOnly: false });
                }}
              >
                重试失败{failedPipelineIds.length > 0 ? `(${failedPipelineIds.length})` : ''}
              </Button>
              <Button
                size="small"
                disabled={
                  !hasOperatePermission ||
                  globalActionBusy ||
                  retryableFailedPipelineIds.length === 0
                }
                onClick={() => {
                  void onRetryBatchHistory(record, { retryableOnly: true });
                }}
              >
                重试可重试
                {retryableFailedPipelineIds.length > 0
                  ? `(${retryableFailedPipelineIds.length})`
                  : ''}
              </Button>
            </div>
          </div>
        );
      },
    },
  ];
}
