import { Button, Tag, type TableColumnsType } from '@lobehub/ui';
import { Pencil, Trash2 } from 'lucide-react';
import { confirmDelete } from '../../_components/confirm-delete';
import styles from '../../_components/admin-page.module.css';
import { formatAdminDateTime } from '../../_components/admin-date-formatters';
import { getDisplayEmail } from './user-email-helpers';
import type { User } from '../_lib/users-types';

interface UsersTableColumnsOptions {
  onDelete: (user: User) => void;
  onEdit: (user: User) => void;
  onOpenRoleModal: (user: User) => void;
}

export function buildUsersTableColumns({
  onDelete,
  onEdit,
  onOpenRoleModal,
}: UsersTableColumnsOptions): TableColumnsType<User> {
  return [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 150,
    },
    {
      title: '邮箱',
      key: 'email',
      dataIndex: 'email',
      render: (email: string) => getDisplayEmail(email),
      width: 200,
    },
    {
      title: '全名',
      dataIndex: 'full_name',
      key: 'full_name',
      width: 150,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'error'}>{isActive ? '活跃' : '禁用'}</Tag>
      ),
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => formatAdminDateTime(date),
      width: 170,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <div className={styles.toolbar}>
          <Button
            type="text"
            size="small"
            aria-label="编辑"
            title="编辑"
            icon={<Pencil size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={() => onEdit(record)}
          />
          <Button type="text" size="small" onClick={() => onOpenRoleModal(record)}>
            角色
          </Button>
          <Button
            type="text"
            danger
            size="small"
            aria-label="删除"
            title="删除"
            icon={<Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={() =>
              confirmDelete({
                title: '删除用户',
                content: `确定要删除用户 ${record.username} 吗？`,
                onConfirm: () => onDelete(record),
              })
            }
          />
        </div>
      ),
    },
  ];
}
