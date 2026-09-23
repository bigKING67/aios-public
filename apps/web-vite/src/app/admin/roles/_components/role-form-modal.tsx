'use client';

import { Alert, Form, Input, Modal, Switch } from 'antd';
import type { FormInstance } from 'antd';
import type { Role, RoleFormValues } from './roles-types';

export interface RoleFormModalProps {
  form: FormInstance<RoleFormValues>;
  role: Role | null;
  open: boolean;
  canManageElevatedRoles: boolean;
  isSaving: boolean;
  onSubmit: (values: RoleFormValues) => void;
  onCancel: () => void;
}

export function RoleFormModal({
  form,
  role,
  open,
  canManageElevatedRoles,
  isSaving,
  onSubmit,
  onCancel,
}: RoleFormModalProps) {
  return (
    <Modal
      title={role ? '编辑角色' : '新建角色'}
      open={open}
      onOk={form.submit}
      onCancel={onCancel}
      confirmLoading={isSaving}
      destroyOnHidden
    >
      <Form<RoleFormValues> form={form} layout="vertical" onFinish={onSubmit}>
        {!canManageElevatedRoles ? (
          <Alert
            className="mb-4"
            type="info"
            showIcon
            title="当前账号仅可维护 admin 之下角色；admin 与 super_admin 为保留角色。"
          />
        ) : null}

        <Form.Item
          name="name"
          label="角色名称"
          rules={[{ required: true, message: '请输入角色名称' }]}
        >
          <Input placeholder="例如：运营管理员" />
        </Form.Item>

        <Form.Item
          name="code"
          label="角色编码"
          extra="建议使用小写英文与下划线，例如 dashboard_view、viewer、operator、tmall、douyin、xhs、jd、wx。"
          rules={[{ required: true, message: '请输入角色编码' }]}
        >
          <Input placeholder="例如：ops_admin" />
        </Form.Item>

        <Form.Item name="description" label="角色描述">
          <Input.TextArea placeholder="输入角色职责描述" rows={3} />
        </Form.Item>

        <Form.Item name="is_active" label="启用状态" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="禁用" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
