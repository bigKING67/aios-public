'use client';

import { Button, Tag } from '@lobehub/ui';
import { Pencil, Trash2 } from 'lucide-react';
import { AdminMobilePagination } from '../../_components/admin-mobile-pagination';
import { formatAdminDateTime } from '../../_components/admin-date-formatters';
import { confirmDelete } from '../../_components/confirm-delete';
import styles from '../../_components/admin-page.module.css';
import { getDisplayEmail } from './user-email-helpers';
import type { User } from '../_lib/users-types';

export interface UsersMobileListProps {
  users: User[];
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
  onEdit: (user: User) => void;
  onOpenRoleModal: (user: User) => void;
  onDelete: (user: User) => void;
}

export function UsersMobileList({
  users,
  current,
  pageSize,
  total,
  onChange,
  onEdit,
  onOpenRoleModal,
  onDelete,
}: UsersMobileListProps) {
  return (
    <div className={styles.mobileList}>
      {users.map((item) => (
        <article key={String(item.id)} className={styles.mobileCard}>
          <div className={styles.cardHead}>
            <div className={styles.cardHeadText}>
              <p className={styles.cardTitle}>{item.username}</p>
              <p className={styles.metaMuted}>{getDisplayEmail(item.email)}</p>
            </div>
            <Tag color={item.is_active ? 'success' : 'error'}>{item.is_active ? '活跃' : '禁用'}</Tag>
          </div>
          <p className={styles.meta}>全名：{item.full_name || '-'}</p>
          <p className={styles.metaMuted}>创建时间：{formatAdminDateTime(item.created_at)}</p>
          <div className={styles.toolbar}>
            <Button
              size="small"
              icon={<Pencil size={14} strokeWidth={1.8} aria-hidden="true" />}
              onClick={() => onEdit(item)}
            >
              编辑
            </Button>
            <Button size="small" onClick={() => onOpenRoleModal(item)}>
              角色
            </Button>
            <Button
              size="small"
              danger
              icon={<Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />}
              onClick={() =>
                confirmDelete({
                  title: '删除用户',
                  content: `确定要删除用户 ${item.username} 吗？`,
                  onConfirm: () => onDelete(item),
                })
              }
            >
              删除
            </Button>
          </div>
        </article>
      ))}
      <AdminMobilePagination current={current} pageSize={pageSize} total={total} onChange={onChange} />
    </div>
  );
}
