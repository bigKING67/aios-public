'use client';

import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsAuditEvent } from '@/config/dataops-hub';
import { formatDateTime, truncateText } from './dataops-hub-formatters';
import styles from './dataops-hub.module.css';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsAuditColumnsOptions {
  resolveAuditScopeLabel: (scope: string) => string;
}

function getAuditResultTagColor(result: DataOpsAuditEvent['result']) {
  return result === '成功' ? 'green' : 'red';
}

export function buildDataOpsAuditColumns({
  resolveAuditScopeLabel,
}: DataOpsAuditColumnsOptions): ColumnsType<DataOpsAuditEvent> {
  return [
    { title: '操作', dataIndex: 'action', key: 'action', width: 220 },
    {
      title: '作用域',
      dataIndex: 'scope',
      key: 'scope',
      width: 320,
      render: (value: string) => {
        const scopeLabel = resolveAuditScopeLabel(value);
        return (
          <div className={styles.auditScopeCell}>
            <strong>{scopeLabel}</strong>
            {scopeLabel !== value ? <span>{value}</span> : null}
          </div>
        );
      },
    },
    { title: '执行人', dataIndex: 'operator', key: 'operator', width: 150 },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      width: 120,
      render: (value: DataOpsAuditEvent['result']) => (
        <Tag color={getAuditResultTagColor(value)}>{value}</Tag>
      ),
    },
    {
      title: '时间',
      dataIndex: 'eventAt',
      key: 'eventAt',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    { title: '明细', dataIndex: 'detail', key: 'detail' },
  ];
}

export function buildDataOpsAuditMobileColumns({
  resolveAuditScopeLabel,
}: DataOpsAuditColumnsOptions): ColumnsType<DataOpsAuditEvent> {
  return [
    {
      title: '运行审计',
      key: 'mobile',
      render: (_value, record) => {
        const scopeLabel = resolveAuditScopeLabel(record.scope);
        return (
          <div className="space-y-2 py-1">
            <div className="flex items-start justify-between gap-2">
              <p className="m-0 text-sm font-semibold text-text-primary">{record.action}</p>
              <Tag color={getAuditResultTagColor(record.result)}>{record.result}</Tag>
            </div>
            <div className={pipelineStyles.pipelineTextCell}>
              <p>
                <span>作用域：</span>
                {scopeLabel}
              </p>
              {scopeLabel !== record.scope ? (
                <p>
                  <span>ID：</span>
                  {record.scope}
                </p>
              ) : null}
              <p>
                <span>执行人：</span>
                {record.operator}
              </p>
              <p>
                <span>时间：</span>
                {formatDateTime(record.eventAt)}
              </p>
              <p>
                <span>明细：</span>
                {truncateText(record.detail, 200)}
              </p>
            </div>
          </div>
        );
      },
    },
  ];
}
