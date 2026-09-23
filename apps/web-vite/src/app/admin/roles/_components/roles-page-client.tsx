'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Space,
  Spin,
  Table,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useIsMobile } from '@/hooks/use-media-query';
import { useBackendCapabilities } from '@/hooks/use-backend-capabilities';
import { ADMIN_READ_PERMISSIONS } from '@/lib/permissions';
import { isReservedElevatedRoleCode, isSuperAdminByRoleOrIdentity, normalizeRole } from '@/lib/role-access';
import { useAuthStore } from '@/stores/auth.store';
import { RoleFormModal } from './role-form-modal';
import { useRolesPageActions } from './roles-page-actions';
import { useRolesPageListState } from './roles-page-list-state';
import { RolesMobileList } from './roles-mobile-list';
import { buildRolesTableColumns } from './roles-table-columns';
import type { Role, RoleFormValues } from './roles-types';

export function RolesPageClient() {
  const isMobile = useIsMobile();
  const { data: backendCapabilities, isLoading: isCapabilitiesLoading } = useBackendCapabilities();
  const supportsRolesApi = backendCapabilities?.modules?.roles ?? backendCapabilities?.supportsAdminApis ?? false;
  const currentUser = useAuthStore((state) => state.user);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form] = Form.useForm<RoleFormValues>();
  const canManageElevatedRoles = useMemo(
    () =>
      isSuperAdminByRoleOrIdentity(currentUser?.roles || [], {
        username: currentUser?.username,
        email: currentUser?.email,
        fullName: currentUser?.full_name,
      }),
    [currentUser?.email, currentUser?.full_name, currentUser?.roles, currentUser?.username]
  );

  const {
    roleItems,
    roleTotal,
    isLoading,
    isFetching,
    refetch,
    mobilePageSize,
    mobilePaginationCurrent,
    mobilePagedRoles,
    handleMobilePaginationChange,
  } = useRolesPageListState({
    supportsRolesApi,
  });

  const {
    createRoleMutation,
    updateRoleMutation,
    deleteRoleMutation,
    bootstrapDefaultRolesMutation,
  } = useRolesPageActions({
    form,
    editingRole,
    setIsModalOpen,
    setEditingRole,
  });

  const handleCreate = useCallback(() => {
    setEditingRole(null);
    form.setFieldsValue({
      name: '',
      code: '',
      description: '',
      is_active: true,
    });
    setIsModalOpen(true);
  }, [form]);

  const handleEdit = useCallback(
    (role: Role) => {
      if (!canManageElevatedRoles && isReservedElevatedRoleCode(role.code)) {
        message.warning('仅超级管理员可编辑 admin/super_admin 角色。');
        return;
      }

      setEditingRole(role);
      form.setFieldsValue({
        name: role.name,
        code: role.code,
        description: role.description,
        is_active: role.is_active ?? true,
      });
      setIsModalOpen(true);
    },
    [canManageElevatedRoles, form]
  );

  const handleCancel = useCallback(() => {
    setIsModalOpen(false);
    setEditingRole(null);
    form.resetFields();
  }, [form]);

  const handleSubmit = useCallback(
    (values: RoleFormValues) => {
      const normalizedCode = normalizeRole(values.code);
      if (!normalizedCode) {
        message.error('请输入角色编码');
        return;
      }

      if (!canManageElevatedRoles && isReservedElevatedRoleCode(normalizedCode)) {
        message.error('仅超级管理员可创建或修改 admin/super_admin 角色。');
        return;
      }

      if (!canManageElevatedRoles && editingRole && isReservedElevatedRoleCode(editingRole.code)) {
        message.error('仅超级管理员可编辑 admin/super_admin 角色。');
        return;
      }

      const payload: RoleFormValues = {
        ...values,
        code: normalizedCode,
      };

      if (editingRole) {
        updateRoleMutation.mutate(payload);
        return;
      }
      createRoleMutation.mutate(payload);
    },
    [canManageElevatedRoles, createRoleMutation, editingRole, updateRoleMutation]
  );

  const handleDeleteRole = useCallback(
    (role: Role) => {
      if (!canManageElevatedRoles && isReservedElevatedRoleCode(role.code)) {
        message.warning('仅超级管理员可删除 admin/super_admin 角色。');
        return;
      }

      deleteRoleMutation.mutate(role.id);
    },
    [canManageElevatedRoles, deleteRoleMutation]
  );

  const columns = useMemo(
    () =>
      buildRolesTableColumns({
        canManageElevatedRoles,
        onDelete: handleDeleteRole,
        onEdit: handleEdit,
      }),
    [canManageElevatedRoles, handleDeleteRole, handleEdit]
  );

  return (
    <ProtectedRoute
      requiredPermission={ADMIN_READ_PERMISSIONS}
      permissionMode="any"
    >
      <Layout>
        {!isCapabilitiesLoading && !supportsRolesApi ? (
          <Card title="角色管理">
            <Alert
              type="info"
              showIcon
              title="当前后端未启用角色管理接口"
              description={`检测到后端：${backendCapabilities?.backendName || 'unknown'}。当前环境的角色管理接口不可用，角色管理页已自动降级为提示态。`}
            />
          </Card>
        ) : null}
        {isCapabilitiesLoading ? (
          <Card title="角色管理">
            <Spin />
          </Card>
        ) : null}
        {!isCapabilitiesLoading && supportsRolesApi ? (
          <>
            <Card
              title="角色管理"
              extra={
                <Space wrap>
                  <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()}>
                    刷新
                  </Button>
                  <Button
                    loading={bootstrapDefaultRolesMutation.isPending}
                    onClick={() => bootstrapDefaultRolesMutation.mutate()}
                  >
                    补齐默认角色
                  </Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                    新建角色
                  </Button>
                </Space>
              }
            >
              {isLoading ? (
                <Spin />
              ) : isMobile ? (
                <RolesMobileList
                  roles={mobilePagedRoles}
                  current={mobilePaginationCurrent}
                  pageSize={mobilePageSize}
                  total={roleTotal}
                  canManageElevatedRoles={canManageElevatedRoles}
                  onChange={handleMobilePaginationChange}
                  onEdit={handleEdit}
                  onDelete={handleDeleteRole}
                />
              ) : (
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={roleItems}
                  pagination={{
                    pageSize: 20,
                    total: roleTotal,
                    showTotal: (total) => `共 ${total} 条`,
                  }}
                  scroll={{ x: 1200 }}
                />
              )}
            </Card>

            <RoleFormModal
              role={editingRole}
              open={isModalOpen}
              form={form}
              canManageElevatedRoles={canManageElevatedRoles}
              isSaving={createRoleMutation.isPending || updateRoleMutation.isPending}
              onCancel={handleCancel}
              onSubmit={handleSubmit}
            />
          </>
        ) : null}
      </Layout>
    </ProtectedRoute>
  );
}
