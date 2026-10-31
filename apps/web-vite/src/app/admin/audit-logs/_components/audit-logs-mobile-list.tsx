'use client';

import { Tag } from '@lobehub/ui';
import { AdminMobilePagination } from '../../_components/admin-mobile-pagination';
import styles from '../../_components/admin-page.module.css';
import type { AuditLog } from './audit-logs-types';
import {
  formatAuditLogCreatedAt,
  getAuditLogOperator,
  getAuditLogResourceText,
  getAuditLogResultState,
} from './audit-logs-view-model';

export interface AuditLogsMobileListProps {
  auditItems: AuditLog[];
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
  onShowSizeChange: (page: number, pageSize: number) => void;
}

export function AuditLogsMobileList({
  auditItems,
  page,
  pageSize,
  total,
  onChange,
  onShowSizeChange,
}: AuditLogsMobileListProps) {
  return (
    <div className={styles.mobileList}>
      {auditItems.map((item) => {
        const resultState = getAuditLogResultState(item);

        return (
          <article key={String(item.id)} className={styles.mobileCard}>
            <div className={styles.cardHead}>
              <div className={styles.cardHeadText}>
                <p className={`${styles.cardTitle} ${styles.cardTitleWrap}`}>{item.action || '-'}</p>
                <p className={styles.metaMuted}>{item.module || '-'}</p>
              </div>
              <Tag color={resultState.color}>{resultState.label}</Tag>
            </div>
            <p className={styles.meta}>资源：{getAuditLogResourceText(item)}</p>
            <p className={styles.meta}>操作者：{getAuditLogOperator(item)}</p>
            <p className={styles.metaMuted}>时间：{formatAuditLogCreatedAt(item.created_at)}</p>
            {item.ip_address ? <p className={styles.metaMuted}>IP：{item.ip_address}</p> : null}
            {item.detail ? <p className={`${styles.meta} ${styles.preWrap}`}>详情：{item.detail}</p> : null}
          </article>
        );
      })}
      <AdminMobilePagination
        current={page}
        pageSize={pageSize}
        total={total}
        onChange={onChange}
        onPageSizeChange={onShowSizeChange}
      />
    </div>
  );
}
