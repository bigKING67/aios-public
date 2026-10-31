'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Input, Modal, Switch, TextArea } from '@lobehub/ui';
import { FormField } from '@/components/molecules/form-field';
import { bindTextField, type ControlledFormRules, useControlledForm } from '@/hooks/use-controlled-form';
import styles from '../../_components/admin-page.module.css';
import type { Role, RoleFormValues } from './roles-types';

export interface RoleFormModalProps {
  role: Role | null;
  open: boolean;
  canManageElevatedRoles: boolean;
  isSaving: boolean;
  onSubmit: (values: RoleFormValues) => void;
  onCancel: () => void;
}

type RoleTextFields = Record<'name' | 'code' | 'description', string | undefined>;

const ROLE_RULES: ControlledFormRules<RoleTextFields> = {
  name: [{ required: true, message: '请输入角色名称' }],
  code: [{ required: true, message: '请输入角色编码' }],
};
const CODE_HINT = '建议使用小写英文与下划线，例如 dashboard_view、viewer、operator、tmall、douyin、xhs、jd、wx。';

/**
 * Create / edit role dialog. The parent remounts it (a new `key`) for every open, so the fields
 * start from `role` (or the blank template) each time.
 */
export function RoleFormModal({ role, open, canManageElevatedRoles, isSaving, onSubmit, onCancel }: RoleFormModalProps) {
  const form = useControlledForm<RoleTextFields>({
    initialValues: role
      ? { name: role.name, code: role.code, description: role.description }
      : { name: '', code: '', description: '' },
    rules: ROLE_RULES,
  });
  const [isActive, setIsActive] = useState(role ? (role.is_active ?? true) : true);

  const submit = () => {
    form.validateFields().then(
      (valid) => onSubmit({ name: valid.name ?? '', code: valid.code, description: valid.description, is_active: isActive }),
      () => undefined,
    );
  };
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  return (
    <Modal
      title={role ? '编辑角色' : '新建角色'}
      open={open}
      onOk={submit}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      confirmLoading={isSaving}
      destroyOnHidden
    >
      <form className={styles.form} onSubmit={handleFormSubmit} noValidate>
        {!canManageElevatedRoles ? (
          <Alert type="info" showIcon title="当前账号仅可维护 admin 之下角色；admin 与 super_admin 为保留角色。" />
        ) : null}

        <FormField form={form} name="name" label="角色名称" required>
          <Input {...bindTextField(form, 'name')} placeholder="例如：运营管理员" />
        </FormField>

        <FormField form={form} name="code" label="角色编码" required extra={CODE_HINT}>
          <Input {...bindTextField(form, 'code')} placeholder="例如：ops_admin" />
        </FormField>

        <FormField form={form} name="description" label="角色描述">
          <TextArea {...bindTextField(form, 'description')} placeholder="输入角色职责描述" rows={3} />
        </FormField>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="role-form-active">
            启用状态
          </label>
          <div className={styles.switchRow}>
            <Switch
              id="role-form-active"
              checked={isActive}
              checkedChildren="启用"
              unCheckedChildren="禁用"
              onChange={(checked) => setIsActive(checked)}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
