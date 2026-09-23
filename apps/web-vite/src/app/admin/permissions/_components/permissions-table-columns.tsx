import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { PermissionItem } from './permissions-types';

export const PERMISSIONS_TABLE_COLUMNS: ColumnsType<PermissionItem> = [
  {
    title: '权限代码',
    dataIndex: 'code',
    key: 'code',
    width: 240,
    render: (value: string) => <code>{value}</code>,
  },
  {
    title: '权限名称',
    key: 'name',
    width: 180,
    render: (_, record) => record.display_name || record.name || '-',
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
    width: 120,
    render: (value?: string) => <Tag color="blue">{value || '-'}</Tag>,
  },
  {
    title: '资源',
    dataIndex: 'resource_type',
    key: 'resource_type',
    width: 120,
    render: (value?: string) => value || '-',
  },
  {
    title: '状态',
    dataIndex: 'is_active',
    key: 'is_active',
    width: 100,
    render: (value?: boolean) => (
      <Tag color={value === false ? 'default' : 'green'}>
        {value === false ? '禁用' : '启用'}
      </Tag>
    ),
  },
  {
    title: '描述',
    dataIndex: 'description',
    key: 'description',
    ellipsis: true,
  },
];
