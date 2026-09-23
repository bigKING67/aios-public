'use client';

import { Card, Pagination, Tag } from 'antd';
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
    <div className="space-y-3">
      {auditItems.map((item) => {
        const resultState = getAuditLogResultState(item);

        return (
          <Card key={String(item.id)} size="small" className="w-full">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold text-text-primary">{item.action || '-'}</p>
                  <p className="m-0 text-xs text-text-tertiary">{item.module || '-'}</p>
                </div>
                <Tag color={resultState.color}>{resultState.label}</Tag>
              </div>
              <p className="m-0 break-all text-xs text-text-secondary">
                资源：{getAuditLogResourceText(item)}
              </p>
              <p className="m-0 text-xs text-text-secondary">
                操作者：{getAuditLogOperator(item)}
              </p>
              <p className="m-0 text-xs text-text-tertiary">
                时间：{formatAuditLogCreatedAt(item.created_at)}
              </p>
              {item.ip_address ? (
                <p className="m-0 text-xs text-text-tertiary">IP：{item.ip_address}</p>
              ) : null}
              {item.detail ? (
                <p className="m-0 whitespace-pre-wrap break-words text-xs text-text-secondary">
                  详情：{item.detail}
                </p>
              ) : null}
            </div>
          </Card>
        );
      })}
      <Pagination
        size="small"
        current={page}
        pageSize={pageSize}
        total={total}
        showSizeChanger
        showTotal={(totalCount) => `共 ${totalCount} 条`}
        onChange={onChange}
        onShowSizeChange={onShowSizeChange}
        hideOnSinglePage
      />
    </div>
  );
}
