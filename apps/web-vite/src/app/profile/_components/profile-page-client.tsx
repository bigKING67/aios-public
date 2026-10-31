'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { Alert, Button, Empty, InputPassword, Tag, toast } from '@lobehub/ui';
import { PageHeader, Surface } from '@lobehub/ui/dashboard';
import { FormField } from '@/components/molecules/form-field';
import { PASSWORD_TOGGLE_LABELS } from '@/components/molecules/password-toggle-labels';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/hooks/use-auth';
import { bindTextField, type ControlledFormRules, useControlledForm } from '@/hooks/use-controlled-form';
import { apiClient } from '@/lib/api-client';
import { resolveClientErrorMessage } from '@/lib/client-error';
import {
  AIOS_API_PATHS,
  type ChangePasswordRequest,
} from '@/lib/generated-api-contract';
import styles from './profile-page.module.css';

type ChangePasswordFormValues = Record<'currentPassword' | 'newPassword' | 'confirmPassword', string | undefined>;

const EMPTY_PASSWORD_FORM: ChangePasswordFormValues = {
  currentPassword: undefined,
  newPassword: undefined,
  confirmPassword: undefined,
};
const PASSWORD_RULES: ControlledFormRules<ChangePasswordFormValues> = {
  currentPassword: [{ required: true, message: '请输入当前密码' }],
  newPassword: [
    { required: true, message: '请输入新密码' },
    { min: 8, message: '新密码长度至少为 8 位' },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '新密码至少包含 1 个字母和 1 个数字' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码' },
    { validator: (value, values) => values.newPassword === value, message: '两次输入的新密码不一致' },
  ],
};

const PASSWORD_FIELDS: ReadonlyArray<{
  key: keyof ChangePasswordFormValues;
  label: string;
  placeholder: string;
  autoComplete: string;
}> = [
  { key: 'currentPassword', label: '当前密码', placeholder: '请输入当前密码', autoComplete: 'current-password' },
  { key: 'newPassword', label: '新密码', placeholder: '至少 8 位，包含字母和数字', autoComplete: 'new-password' },
  { key: 'confirmPassword', label: '确认新密码', placeholder: '请再次输入新密码', autoComplete: 'new-password' },
];

function formatRoleLabel(role: string): string {
  const normalized = role.trim().toLowerCase();
  if (normalized === 'admin') {
    return '管理员';
  }
  if (normalized === 'super_admin' || normalized === 'super-admin') {
    return '超级管理员';
  }
  if (normalized === 'analyst') {
    return '数据分析师';
  }
  if (normalized === 'viewer') {
    return '查看者';
  }
  return role;
}

export function ProfilePageClient() {
  const { user, permissions } = useAuth();
  const form = useControlledForm<ChangePasswordFormValues>({
    initialValues: EMPTY_PASSWORD_FORM,
    rules: PASSWORD_RULES,
    ids: { currentPassword: 'profile-currentPassword', newPassword: 'profile-newPassword', confirmPassword: 'profile-confirmPassword' },
  });
  const { resetFields } = form;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChangePassword = useCallback(
    async (formValues: ChangePasswordFormValues) => {
      setIsSubmitting(true);
      try {
        const request: ChangePasswordRequest = {
          current_password: formValues.currentPassword ?? '',
          new_password: formValues.newPassword ?? '',
        };
        await apiClient.post(AIOS_API_PATHS.changePassword, request);
        toast.success('密码修改成功，请在下次登录时使用新密码。');
        resetFields();
      } catch (error: unknown) {
        toast.error(resolveClientErrorMessage(error, '密码修改失败'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [resetFields]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    form.validateFields().then(
      (valid) => void handleChangePassword(valid),
      () => undefined,
    );
  };

  return (
    <ProtectedRoute>
      <Layout>
        <section className={styles.page} aria-labelledby="profile-page-title">
          <PageHeader title={<span id="profile-page-title">个人信息</span>} />

          <Surface padded>
            {user ? (
              <dl className={styles.facts}>
                <div className={styles.fact}>
                  <dt>账号</dt>
                  <dd>{user.username}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>姓名</dt>
                  <dd>{user.full_name || '-'}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>邮箱</dt>
                  <dd>{user.email || '-'}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>角色</dt>
                  <dd className={styles.tags}>
                    {(user.roles || []).length ? (
                      user.roles?.map((role) => <Tag key={role}>{formatRoleLabel(role)}</Tag>)
                    ) : (
                      <Tag>未分配</Tag>
                    )}
                  </dd>
                </div>
                <div className={styles.fact}>
                  <dt>密码</dt>
                  <dd className={styles.muted}>已加密存储，不展示明文。可在下方“修改密码”中自行更新。</dd>
                </div>
              </dl>
            ) : (
              <Empty description="未获取到当前用户信息，请重新登录后重试" />
            )}
          </Surface>

          <Surface title="修改密码">
            <form className={styles.passwordForm} autoComplete="on" noValidate onSubmit={handleSubmit}>
              {PASSWORD_FIELDS.map((field) => (
                <FormField key={field.key} form={form} name={field.key} label={field.label} required>
                  <InputPassword
                    {...bindTextField(form, field.key)}
                    placeholder={field.placeholder}
                    autoComplete={field.autoComplete}
                    visibilityToggleLabels={PASSWORD_TOGGLE_LABELS}
                  />
                </FormField>
              ))}

              <div className={styles.actions}>
                <Button type="primary" htmlType="submit" loading={isSubmitting}>
                  更新密码
                </Button>
                <Button onClick={resetFields} disabled={isSubmitting}>
                  清空
                </Button>
              </div>
            </form>
          </Surface>

          <Surface title={`权限列表 (${permissions.length})`}>
            {permissions.length ? (
              <ul className={styles.permissions}>
                {permissions.map((permission) => (
                  <li key={permission}>
                    <code>{permission}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <Alert
                type="info"
                showIcon
                title="当前账号暂无权限记录"
                description="请联系系统管理员为该账号分配角色或权限。"
              />
            )}
          </Surface>
        </section>
      </Layout>
    </ProtectedRoute>
  );
}
