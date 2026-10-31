'use client';

import { Tag } from '@lobehub/ui';
import { AdminMobilePagination } from '../../_components/admin-mobile-pagination';
import styles from '../../_components/admin-page.module.css';
import type { PermissionItem } from './permissions-types';

export interface PermissionsMobileListProps {
  current: number;
  items: PermissionItem[];
  onPaginationChange: (page: number, pageSize: number) => void;
  pageSize: number;
  total: number;
}

export function PermissionsMobileList({
  current,
  items,
  onPaginationChange,
  pageSize,
  total,
}: PermissionsMobileListProps) {
  return (
    <div className={styles.mobileList}>
      {items.map((item) => (
        <article key={String(item.id ?? item.code)} className={styles.mobileCard}>
          <div className={styles.cardHead}>
            <div className={styles.cardHeadText}>
              <p className={`${styles.cardTitle} ${styles.cardTitleWrap}`}>
                <code className={styles.code}>{item.code}</code>
              </p>
              <p className={styles.meta}>{item.display_name || item.name || '-'}</p>
            </div>
            <Tag color={item.is_active === false ? undefined : 'success'}>
              {item.is_active === false ? '禁用' : '启用'}
            </Tag>
          </div>
          <div className={styles.tagRow}>
            <Tag>{item.module || '-'}</Tag>
            <Tag>{item.action || '-'}</Tag>
            <Tag>{item.resource_type || '-'}</Tag>
          </div>
          <p className={styles.meta}>描述：{item.description || '-'}</p>
        </article>
      ))}
      <AdminMobilePagination current={current} pageSize={pageSize} total={total} onChange={onPaginationChange} />
    </div>
  );
}
