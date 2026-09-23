'use client';

import { Button, Card, Pagination, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { isReservedElevatedRoleCode } from '@/lib/role-access';
import { formatAdminDateTime } from '../../_components/admin-date-formatters';
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
    <div className="space-y-3">
      {roles.map((item) => {
        const permissionCount = item.permissions_count ?? item.permissions?.length ?? 0;
        const isActive = item.is_active !== false;
        const isReservedElevatedRole = isReservedElevatedRoleCode(item.code);
        const operationDisabled = !canManageElevatedRoles && isReservedElevatedRole;

        return (
          <Card key={String(item.id)} size="small" className="w-full">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-semibold text-text-primary">{item.name}</p>
                  <p className="m-0 truncate text-xs text-text-tertiary">
                    编码：<code>{item.code || '-'}</code>
                  </p>
                </div>
                <Tag color={isActive ? 'green' : 'default'}>
                  {isActive ? '启用' : '禁用'}
                </Tag>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag color="blue">权限 {permissionCount}</Tag>
                <Tag>成员 {item.user_count ?? 0}</Tag>
              </div>
              <p className="m-0 text-xs text-text-secondary">描述：{item.description || '-'}</p>
              <p className="m-0 text-xs text-text-tertiary">
                创建时间：{formatAdminDateTime(item.created_at)}
              </p>
              <Space wrap>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  disabled={operationDisabled}
                  onClick={() => onEdit(item)}
                >
                  编辑
                </Button>
                <Popconfirm
                  title="删除角色"
                  description={`确定删除角色「${item.name}」吗？`}
                  okText="删除"
                  cancelText="取消"
                  disabled={operationDisabled}
                  onConfirm={() => onDelete(item)}
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={operationDisabled}
                  >
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          </Card>
        );
      })}
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
