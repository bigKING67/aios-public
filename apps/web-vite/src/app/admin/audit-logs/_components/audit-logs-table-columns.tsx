import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AuditLog } from './audit-logs-types';
import {
  formatAuditLogCreatedAt,
  getAuditLogOperator,
  getAuditLogResourceText,
  getAuditLogResultState,
} from './audit-logs-view-model';

export function buildAuditLogsTableColumns(): ColumnsType<AuditLog> {
  return [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: formatAuditLogCreatedAt,
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
      render: (value?: string) => <Tag>{value || '-'}</Tag>,
    },
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      width: 140,
      render: (value?: string) => <Tag color="blue">{value || '-'}</Tag>,
    },
    {
      title: '资源',
      key: 'resource',
      width: 180,
      render: (_, record) => getAuditLogResourceText(record),
    },
    {
      title: '操作者',
      key: 'operator',
      width: 150,
      render: (_, record) => getAuditLogOperator(record),
    },
    {
      title: '结果',
      key: 'result',
      width: 100,
      render: (_, record) => {
        const resultState = getAuditLogResultState(record);
        return <Tag color={resultState.color}>{resultState.label}</Tag>;
      },
    },
    {
      title: 'IP',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 150,
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
    },
  ];
}
