/**
 * 登录页面
 *
 * 提供用户登录功能：
 * - 用户名密码输入
 * - 登录表单提交
 * - 错误处理和显示
 * - 成功登录后重定向到首页
 */

'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Input, InputPassword, toast } from '@lobehub/ui';
import { AuthLayout } from '@lobehub/ui/dashboard';
import { LockKeyhole, UserRound } from 'lucide-react';
import { FormField } from '@/components/molecules/form-field';
import { PASSWORD_TOGGLE_LABELS } from '@/components/molecules/password-toggle-labels';
import { bindTextField, type ControlledFormRules, useControlledForm } from '@/hooks/use-controlled-form';
import { useAuth } from '@/hooks/use-auth';
import { useAuthStore } from '@/stores/auth.store';
import { resolveSafeEntryPath } from '@/lib/auth-navigation';
import { resolveClientErrorMessage } from '@/lib/client-error';
import styles from '../login.module.css';

type LoginFormValues = Record<'username' | 'password', string | undefined>;

const LOGIN_RULES: ControlledFormRules<LoginFormValues> = {
  username: [
    { required: true, message: '请输入用户名' },
    { min: 3, message: '用户名至少 3 个字符' },
  ],
  password: [{ required: true, message: '请输入密码' }],
};

export function LoginPageClient() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error, signIn } = useAuth();
  const form = useControlledForm<LoginFormValues>({
    initialValues: { username: undefined, password: undefined },
    rules: LOGIN_RULES,
    // Stable ids: password managers and the browser sign-in profile target #username / #password.
    ids: { username: 'username', password: 'password' },
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const redirectPath = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/';
    }
    const search = new URLSearchParams(window.location.search);
    return search.get('redirect') || '/';
  }, []);

  const getPostLoginPath = useCallback(() => {
    const { permissions: currentPermissions, user } = useAuthStore.getState();
    return resolveSafeEntryPath(
      redirectPath,
      currentPermissions,
      user?.roles || [],
      {
        username: user?.username,
        email: user?.email,
        fullName: user?.full_name,
      },
      Boolean(user)
    );
  }, [redirectPath]);

  // 如果已认证，重定向到首页
  useEffect(() => {
    if (isAuthenticated) {
      navigate(getPostLoginPath(), { replace: true });
    }
  }, [getPostLoginPath, isAuthenticated, navigate]);

  /**
   * 处理登录表单提交
   */
  const handleLogin = async (formValues: LoginFormValues) => {
    setLocalError(null);

    try {
      await signIn(formValues.username ?? '', formValues.password ?? '');
      toast.success('登录成功！');

      // 登录成功后跳转到首屏可访问页面
      navigate(getPostLoginPath(), { replace: true });
    } catch (err: unknown) {
      const errorMsg = resolveClientErrorMessage(err, error || '登录失败，请重试');
      setLocalError(errorMsg);
      toast.error(errorMsg);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    form.validateFields().then(
      (valid) => void handleLogin(valid),
      () => undefined,
    );
  };

  return (
    <AuthLayout
      logo={
        <span className={styles.logo} aria-hidden="true">
          ✦
        </span>
      }
      title="AGI AIOS"
      description="AI 驱动的业务生产力系统"
      alert={
        localError || error ? (
          <Alert title="登录失败" description={localError || error} type="error" showIcon closable />
        ) : null
      }
      footer={<p className={styles.footnote}>使用公司账号登录，权限按角色自动收敛。</p>}
    >
      <form className={styles.form} onSubmit={handleSubmit} autoComplete="off" noValidate>
        <FormField form={form} name="username" label="用户名" required>
          <Input
            {...bindTextField(form, 'username')}
            prefix={<UserRound size={16} strokeWidth={1.8} aria-hidden="true" className={styles.prefixIcon} />}
            placeholder="输入用户名"
            disabled={isLoading}
            size="large"
          />
        </FormField>

        <FormField form={form} name="password" label="密码" required>
          <InputPassword
            {...bindTextField(form, 'password')}
            prefix={<LockKeyhole size={16} strokeWidth={1.8} aria-hidden="true" className={styles.prefixIcon} />}
            placeholder="输入密码"
            disabled={isLoading}
            size="large"
            visibilityToggleLabels={PASSWORD_TOGGLE_LABELS}
          />
        </FormField>

        <Button type="primary" htmlType="submit" loading={isLoading} block size="large">
          登录
        </Button>
      </form>
    </AuthLayout>
  );
}
