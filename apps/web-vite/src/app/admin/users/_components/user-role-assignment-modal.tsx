'use client';

import { Alert, Modal, Select, Space, Spin, Tag } from 'antd';
import { isReservedElevatedRoleCode } from '@/lib/role-access';
import type { User, UserRoleItem } from '../_lib/users-types';

export interface UserRoleSelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface UserRoleAssignmentModalProps {
  user: User | null;
  roleItems: UserRoleItem[];
  roleOptions: UserRoleSelectOption[];
  selectedRoleIds: string[];
  canManageElevatedRoles: boolean;
  roleEditBlocked: boolean;
  isRoleListLoading: boolean;
  isRoleSelectionLoading: boolean;
  isSaving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onSelectedRoleIdsChange: (roleIds: string[]) => void;
}

export function UserRoleAssignmentModal({
  user,
  roleItems,
  roleOptions,
  selectedRoleIds,
  canManageElevatedRoles,
  roleEditBlocked,
  isRoleListLoading,
  isRoleSelectionLoading,
  isSaving,
  onSubmit,
  onCancel,
  onSelectedRoleIdsChange,
}: UserRoleAssignmentModalProps) {
  const isLoading = isRoleListLoading || isRoleSelectionLoading;

  return (
    <Modal
      title={user ? `分配角色 - ${user.username}` : '分配角色'}
      open={!!user}
      onOk={onSubmit}
      onCancel={onCancel}
      destroyOnHidden
      okText="保存角色"
      cancelText="取消"
      okButtonProps={{
        disabled: isLoading || roleEditBlocked,
      }}
      confirmLoading={isSaving}
    >
      {isLoading ? (
        <Spin />
      ) : (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          {!canManageElevatedRoles ? (
            <Alert
              type="info"
              showIcon
              title="当前账号仅可授予 admin 之下角色；admin 与 super_admin 仅超级管理员可维护。"
            />
          ) : null}

          {roleEditBlocked ? (
            <Alert
              type="warning"
              showIcon
              title="目标用户包含 admin/super_admin 角色，仅超级管理员可修改。"
            />
          ) : null}

          <div>
            <div className="mb-2 text-xs text-text-tertiary">当前角色</div>
            <Space wrap>
              {roleItems.length > 0 ? (
                roleItems.map((role) => (
                  <Tag
                    key={`${role.id}-${role.code}`}
                    color={isReservedElevatedRoleCode(role.code) ? 'gold' : 'blue'}
                  >
                    {role.name} ({role.code})
                  </Tag>
                ))
              ) : (
                <Tag>暂无角色</Tag>
              )}
            </Space>
          </div>

          <Select
            mode="multiple"
            allowClear
            style={{ width: '100%' }}
            placeholder="选择角色（可多选）"
            value={selectedRoleIds}
            options={roleOptions}
            onChange={(values) => onSelectedRoleIdsChange(values.map((value) => String(value)))}
            disabled={roleEditBlocked}
          />
        </Space>
      )}
    </Modal>
  );
}
