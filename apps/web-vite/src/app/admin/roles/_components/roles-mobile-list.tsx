'use client';

import { Button, Tag } from '@lobehub/ui';
import { Pencil, Trash2 } from 'lucide-react';
import { isReservedElevatedRoleCode } from '@/lib/role-access';
import { AdminMobilePagination } from '../../_components/admin-mobile-pagination';
import { formatAdminDateTime } from '../../_components/admin-date-formatters';
import { confirmDelete } from '../../_components/confirm-delete';
import styles from '../../_components/admin-page.module.css';
import type { Role } from './roles-types';

export interface RolesMobileListProps {
  roles: Role[];
  current: number;
  pageSize: number;
  total: number;
  canManageElevatedRoles: boolean;
  onChange: (page: number, pageSize: number) => void;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export function RolesMobileList({
  roles,
  current,
  pageSize,
  total,
  canManageElevatedRoles,
  onChange,
  onEdit,
  onDelete,
}: RolesMobileListProps) {
  return (
    <div className={styles.mobileList}>
      {roles.map((item) => {
        const permissionCount = item.permissions_count ?? item.permissions?.length ?? 0;
        const isActive = item.is_active !== false;
        const isReservedElevatedRole = isReservedElevatedRoleCode(item.code);
        const operationDisabled = !canManageElevatedRoles && isReservedElevatedRole;

        return (
          <article key={String(item.id)} className={styles.mobileCard}>
            <div className={styles.cardHead}>
              <div className={styles.cardHeadText}>
                <p className={styles.cardTitle}>{item.name}</p>
                <p className={styles.metaMuted}>
                  编码：<code className={styles.code}>{item.code || '-'}</code>
                </p>
              </div>
              <Tag color={isActive ? 'success' : undefined}>{isActive ? '启用' : '禁用'}</Tag>
            </div>
            <div className={styles.tagRow}>
              <Tag>权限 {permissionCount}</Tag>
              <Tag>成员 {item.user_count ?? 0}</Tag>
            </div>
            <p className={styles.meta}>描述：{item.description || '-'}</p>
            <p className={styles.metaMuted}>创建时间：{formatAdminDateTime(item.created_at)}</p>
            <div className={styles.toolbar}>
              <Button
                size="small"
                icon={<Pencil size={14} strokeWidth={1.8} aria-hidden="true" />}
                disabled={operationDisabled}
                onClick={() => onEdit(item)}
              >
                编辑
              </Button>
              <Button
                size="small"
                danger
                icon={<Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />}
                disabled={operationDisabled}
                onClick={() =>
                  confirmDelete({
                    title: '删除角色',
                    content: `确定删除角色「${item.name}」吗？`,
                    onConfirm: () => onDelete(item),
                  })
                }
              >
                删除
              </Button>
            </div>
          </article>
        );
      })}
      <AdminMobilePagination current={current} pageSize={pageSize} total={total} onChange={onChange} />
    </div>
  );
}
