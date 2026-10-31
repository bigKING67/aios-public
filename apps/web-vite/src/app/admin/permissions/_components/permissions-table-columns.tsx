import { Tag, type TableColumnsType } from '@lobehub/ui';
import styles from '../../_components/admin-page.module.css';
import type { PermissionItem } from './permissions-types';

export const PERMISSIONS_TABLE_COLUMNS: TableColumnsType<PermissionItem> = [
  {
    title: '权限代码',
    dataIndex: 'code',
    key: 'code',
    width: 240,
    render: (value: string) => <code className={styles.code}>{value}</code>,
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
    render: (value?: string) => <Tag>{value || '-'}</Tag>,
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
      <Tag color={value === false ? undefined : 'success'}>{value === false ? '禁用' : '启用'}</Tag>
    ),
  },
  {
    title: '描述',
    dataIndex: 'description',
    key: 'description',
    ellipsis: true,
  },
];
