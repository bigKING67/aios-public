'use client';

import type { FormEvent } from 'react';
import { Alert, Input, InputPassword, Modal } from '@lobehub/ui';
import { FormField } from '@/components/molecules/form-field';
import { PASSWORD_TOGGLE_LABELS } from '@/components/molecules/password-toggle-labels';
import { bindTextField, type ControlledFormRule, useControlledForm } from '@/hooks/use-controlled-form';
import styles from '../../_components/admin-page.module.css';
import type { User, UserFormValues } from '../_lib/users-types';

export interface UserFormModalProps {
  user: User | null;
  open: boolean;
  isSaving: boolean;
  onSubmit: (values: UserFormValues) => void;
  onCancel: () => void;
}

type UserFormFields = Record<'username' | 'password' | 'full_name', string | undefined>;

const USERNAME_RULES: ControlledFormRule<UserFormFields>[] = [
  { required: true, message: '请输入用户名' },
  { min: 3, message: '用户名至少 3 个字符' },
];
const PASSWORD_RULES: ControlledFormRule<UserFormFields>[] = [
  { required: true, message: '请输入密码' },
  { min: 8, message: '密码至少 8 个字符' },
  { validator: (value) => /[A-Za-z]/.test(String(value)) && /\d/.test(String(value)), message: '密码需包含字母和数字' },
];

/**
 * Create / edit user dialog. The parent remounts it (a new `key`) for every open, so the fields
 * start from `user` each time. Editing submits only 全名, as the antd form did.
 */
export function UserFormModal({ user, open, isSaving, onSubmit, onCancel }: UserFormModalProps) {
  const isEditing = !!user;
  const form = useControlledForm<UserFormFields>({
    initialValues: { username: undefined, password: undefined, full_name: user?.full_name },
    rules: isEditing ? {} : { username: USERNAME_RULES, password: PASSWORD_RULES },
  });

  const submit = () => {
    form.validateFields().then(
      (valid) =>
        onSubmit(
          isEditing
            ? { full_name: valid.full_name }
            : { username: valid.username, password: valid.password, full_name: valid.full_name },
        ),
      () => undefined,
    );
  };
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  return (
    <Modal
      title={isEditing ? '编辑用户' : '新建用户'}
      open={open}
      onOk={submit}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      confirmLoading={isSaving}
    >
      <form className={styles.form} onSubmit={handleFormSubmit} noValidate>
        {!isEditing ? (
          <FormField form={form} name="username" label="用户名" required>
            <Input {...bindTextField(form, 'username')} placeholder="输入用户名" />
          </FormField>
        ) : null}

        {!isEditing ? (
          <FormField form={form} name="password" label="密码" required>
            <InputPassword
              {...bindTextField(form, 'password')}
              placeholder="至少 8 位，包含字母和数字"
              autoComplete="new-password"
              visibilityToggleLabels={PASSWORD_TOGGLE_LABELS}
            />
          </FormField>
        ) : null}

        {!isEditing ? (
          <Alert type="info" showIcon title="新建用户仅需账号和密码，邮箱将由系统自动生成内部占位值。" />
        ) : null}

        <FormField form={form} name="full_name" label="全名">
          <Input {...bindTextField(form, 'full_name')} placeholder="输入全名" />
        </FormField>
      </form>
    </Modal>
  );
}
