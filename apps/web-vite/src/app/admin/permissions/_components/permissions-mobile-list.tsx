'use client';

import { Card, Pagination, Tag } from 'antd';
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
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={String(item.id ?? item.code)} size="small" className="w-full">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 break-all text-sm font-semibold text-text-primary">
                  <code>{item.code}</code>
                </p>
                <p className="m-0 text-xs text-text-secondary">
                  {item.display_name || item.name || '-'}
                </p>
              </div>
              <Tag color={item.is_active === false ? 'default' : 'green'}>
                {item.is_active === false ? '禁用' : '启用'}
              </Tag>
            </div>
            <div className="flex flex-wrap gap-2">
              <Tag>{item.module || '-'}</Tag>
              <Tag color="blue">{item.action || '-'}</Tag>
              <Tag>{item.resource_type || '-'}</Tag>
            </div>
            <p className="m-0 text-xs text-text-secondary">
              描述：{item.description || '-'}
            </p>
          </div>
        </Card>
      ))}
      <Pagination
        size="small"
        current={current}
        pageSize={pageSize}
        total={total}
        showSizeChanger
        showTotal={(nextTotal) => `共 ${nextTotal} 条`}
        onChange={onPaginationChange}
        onShowSizeChange={onPaginationChange}
        hideOnSinglePage
      />
    </div>
  );
}
