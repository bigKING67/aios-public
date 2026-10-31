import { Button, Tag, type TableColumnsType } from '@lobehub/ui';
import { Pencil, Trash2 } from 'lucide-react';
import { isReservedElevatedRoleCode } from '@/lib/role-access';
import { formatAdminDateTime } from '../../_components/admin-date-formatters';
import { confirmDelete } from '../../_components/confirm-delete';
import styles from '../../_components/admin-page.module.css';
import type { Role } from './roles-types';

interface RolesTableColumnsOptions {
  canManageElevatedRoles: boolean;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export function buildRolesTableColumns({
  canManageElevatedRoles,
  onEdit,
  onDelete,
}: RolesTableColumnsOptions): TableColumnsType<Role> {
  return [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: '角色编码',
      dataIndex: 'code',
      key: 'code',
      width: 180,
      render: (code?: string) => <code className={styles.code}>{code || '-'}</code>,
    },
    {
      title: '权限数',
      key: 'permissions_count',
      width: 100,
      render: (_, record) => {
        const count = record.permissions_count ?? record.permissions?.length ?? 0;
        return <Tag>{count}</Tag>;
      },
    },
    {
      title: '成员数',
      key: 'user_count',
      width: 100,
      render: (_, record) => <Tag>{record.user_count ?? 0}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive?: boolean) => (
        <Tag color={isActive === false ? undefined : 'success'}>
          {isActive === false ? '禁用' : '启用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value?: string) => formatAdminDateTime(value),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => {
        const isReservedElevatedRole = isReservedElevatedRoleCode(record.code);
        const operationDisabled = !canManageElevatedRoles && isReservedElevatedRole;

        return (
          <div className={styles.toolbar}>
            <Button
              type="text"
              size="small"
              aria-label="编辑"
              title="编辑"
              icon={<Pencil size={14} strokeWidth={1.8} aria-hidden="true" />}
              disabled={operationDisabled}
              onClick={() => onEdit(record)}
            />
            <Button
              type="text"
              danger
              size="small"
              aria-label="删除"
              title="删除"
              icon={<Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />}
              disabled={operationDisabled}
              onClick={() =>
                confirmDelete({
                  title: '删除角色',
                  content: `确定删除角色「${record.name}」吗？`,
                  onConfirm: () => onDelete(record),
                })
              }
            />
          </div>
        );
      },
    },
  ];
}
