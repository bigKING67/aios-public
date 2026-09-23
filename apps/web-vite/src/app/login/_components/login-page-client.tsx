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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Alert, Button, Card, Form, Input, Space } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '@/hooks/use-auth';
import { useAuthStore } from '@/stores/auth.store';
import { resolveSafeEntryPath } from '@/lib/auth-navigation';
import { resolveClientErrorMessage } from '@/lib/client-error';
import styles from '../login.module.css';

interface LoginFormValues {
  username: string;
  password: string;
}

export function LoginPageClient() {
  const { message: messageApi } = App.useApp();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error, signIn } = useAuth();
  const [form] = Form.useForm<LoginFormValues>();
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
  const handleLogin = async (values: LoginFormValues) => {
    setLocalError(null);

    try {
      await signIn(values.username, values.password);
      messageApi.success('登录成功！');

      // 登录成功后跳转到首屏可访问页面
      navigate(getPostLoginPath(), { replace: true });
    } catch (err: unknown) {
      const errorMsg = resolveClientErrorMessage(err, error || '登录失败，请重试');
      setLocalError(errorMsg);
      messageApi.error(errorMsg);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <Card className={styles.loginCard}>
        <Space orientation="vertical" size="large" className="w-full">
          {/* 页面标题 */}
          <div className={styles.loginHeader}>
            <div className={styles.brandMark} aria-hidden="true">
              <img
                src="/favicon.png"
                alt=""
                width={56}
                height={56}
                className={styles.brandMarkImage}
              />
            </div>
            <h1 className={styles.loginTitle}>
              Groland AIOS
            </h1>
            <p className={styles.loginSubtitle}>
              AI 驱动的业务生产力系统
            </p>
          </div>

          {/* 错误提示 */}
          {(localError || error) && (
            <Alert
              title="登录失败"
              description={localError || error}
              type="error"
              showIcon
              closable
            />
          )}

          {/* 登录表单 */}
          <Form<LoginFormValues>
            form={form}
            layout="vertical"
            onFinish={handleLogin}
            autoComplete="off"
            className={styles.loginForm}
          >
            {/* 用户名 */}
            <Form.Item
              name="username"
              label="用户名"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少 3 个字符' },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="输入用户名"
                disabled={isLoading}
                size="large"
              />
            </Form.Item>

            {/* 密码 */}
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="输入密码"
                disabled={isLoading}
                size="large"
              />
            </Form.Item>

            {/* 登录按钮 */}
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={isLoading}
                block
                size="large"
              >
                登录
              </Button>
            </Form.Item>
          </Form>

          <p className={styles.loginFootnote}>
            使用公司账号登录，权限按角色自动收敛。
          </p>
        </Space>
      </Card>
    </div>
  );
}
