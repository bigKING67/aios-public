'use client';

import { Button, Card, Pagination, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { formatAdminDateTime } from '../../_components/admin-date-formatters';
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
    <div className="space-y-3">
      {users.map((item) => (
        <Card key={String(item.id)} size="small" className="w-full">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-semibold text-text-primary">{item.username}</p>
                <p className="m-0 truncate text-xs text-text-tertiary">{getDisplayEmail(item.email)}</p>
              </div>
              <Tag color={item.is_active ? 'green' : 'red'}>
                {item.is_active ? '活跃' : '禁用'}
              </Tag>
            </div>
            <p className="m-0 text-xs text-text-secondary">全名：{item.full_name || '-'}</p>
            <p className="m-0 text-xs text-text-tertiary">
              创建时间：{formatAdminDateTime(item.created_at)}
            </p>
            <Space wrap>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEdit(item)}
              >
                编辑
              </Button>
              <Button
                size="small"
                onClick={() => onOpenRoleModal(item)}
              >
                角色
              </Button>
              <Popconfirm
                title="删除用户"
                description={`确定要删除用户 ${item.username} 吗？`}
                onConfirm={() => onDelete(item)}
                okText="删除"
                cancelText="取消"
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                >
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </div>
        </Card>
      ))}
      <Pagination
        size="small"
        current={current}
        pageSize={pageSize}
        total={total}
        showSizeChanger
        showTotal={(totalCount) => `共 ${totalCount} 条`}
        onChange={onChange}
        onShowSizeChange={onChange}
        hideOnSinglePage
      />
    </div>
  );
}
