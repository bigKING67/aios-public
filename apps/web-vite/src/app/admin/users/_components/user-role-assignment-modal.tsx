'use client';

import { Alert, Modal, Select, Spin, Tag } from '@lobehub/ui';
import { isReservedElevatedRoleCode } from '@/lib/role-access';
import styles from '../../_components/admin-page.module.css';
import type { User, UserRoleItem } from '../_lib/users-types';

const ROLE_SELECT_ID = 'user-role-assignment-select';

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
        <div className={styles.form}>
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

          <div className={styles.field}>
            <span className={styles.hint}>当前角色</span>
            <div className={styles.tagRow}>
              {roleItems.length > 0 ? (
                roleItems.map((role) => (
                  <Tag key={`${role.id}-${role.code}`} color={isReservedElevatedRoleCode(role.code) ? 'warning' : undefined}>
                    {role.name} ({role.code})
                  </Tag>
                ))
              ) : (
                <Tag>暂无角色</Tag>
              )}
            </div>
          </div>

          {/* lobe Select does not forward aria-label: an sr-only label names it. */}
          <div>
            <label className="sr-only" htmlFor={ROLE_SELECT_ID}>
              分配角色
            </label>
            <Select
              id={ROLE_SELECT_ID}
              mode="multiple"
              allowClear
              style={{ width: '100%' }}
              placeholder="选择角色（可多选）"
              value={selectedRoleIds}
              options={roleOptions}
              onChange={(values) =>
                onSelectedRoleIdsChange(Array.isArray(values) ? values.map((value) => String(value)) : [])
              }
              disabled={roleEditBlocked}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
