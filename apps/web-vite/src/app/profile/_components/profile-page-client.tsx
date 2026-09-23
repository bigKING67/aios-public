'use client';

import { useCallback, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Space,
  Tag,
} from 'antd';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { resolveClientErrorMessage } from '@/lib/client-error';
import {
  AIOS_API_PATHS,
  type ChangePasswordRequest,
} from '@/lib/generated-api-contract';

interface ChangePasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

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
  const { message } = App.useApp();
  const { user, permissions } = useAuth();
  const [form] = Form.useForm<ChangePasswordFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChangePassword = useCallback(
    async (values: ChangePasswordFormValues) => {
      setIsSubmitting(true);
      try {
        const request: ChangePasswordRequest = {
          current_password: values.currentPassword,
          new_password: values.newPassword,
        };
        await apiClient.post(AIOS_API_PATHS.changePassword, request);
        message.success('密码修改成功，请在下次登录时使用新密码。');
        form.resetFields();
      } catch (error: unknown) {
        message.error(resolveClientErrorMessage(error, '密码修改失败'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, message]
  );

  return (
    <ProtectedRoute>
      <Layout>
        <Space orientation="vertical" size={16} className="w-full">
          <Card title="个人信息">
            {user ? (
              <dl className="m-0 space-y-3 text-sm">
                <div className="flex items-start gap-4">
                  <dt className="w-24 flex-none text-text-secondary">账号</dt>
                  <dd className="m-0 min-w-0 text-text-primary">{user.username}</dd>
                </div>
                <div className="flex items-start gap-4">
                  <dt className="w-24 flex-none text-text-secondary">姓名</dt>
                  <dd className="m-0 min-w-0 text-text-primary">{user.full_name || '-'}</dd>
                </div>
                <div className="flex items-start gap-4">
                  <dt className="w-24 flex-none text-text-secondary">邮箱</dt>
                  <dd className="m-0 min-w-0 break-words text-text-primary">{user.email || '-'}</dd>
                </div>
                <div className="flex items-start gap-4">
                  <dt className="w-24 flex-none text-text-secondary">角色</dt>
                  <dd className="m-0 min-w-0">
                    <Space wrap size={[8, 8]}>
                      {(user.roles || []).length ? (
                        user.roles?.map((role) => (
                          <Tag key={role} color="blue">
                            {formatRoleLabel(role)}
                          </Tag>
                        ))
                      ) : (
                        <Tag>未分配</Tag>
                      )}
                    </Space>
                  </dd>
                </div>
                <div className="flex items-start gap-4">
                  <dt className="w-24 flex-none text-text-secondary">密码</dt>
                  <dd className="m-0 min-w-0 text-text-secondary">
                    已加密存储，不展示明文。可在下方“修改密码”中自行更新。
                  </dd>
                </div>
              </dl>
            ) : (
              <Empty description="未获取到当前用户信息，请重新登录后重试" />
            )}
          </Card>

          <Card title="修改密码">
            <Form
              form={form}
              layout="vertical"
              autoComplete="on"
              onFinish={(values) => {
                void handleChangePassword(values);
              }}
            >
              <Form.Item<ChangePasswordFormValues>
                label="当前密码"
                name="currentPassword"
                rules={[{ required: true, message: '请输入当前密码' }]}
              >
                <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
              </Form.Item>

              <Form.Item<ChangePasswordFormValues>
                label="新密码"
                name="newPassword"
                rules={[
                  { required: true, message: '请输入新密码' },
                  { min: 8, message: '新密码长度至少为 8 位' },
                  {
                    pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
                    message: '新密码至少包含 1 个字母和 1 个数字',
                  },
                ]}
              >
                <Input.Password placeholder="至少 8 位，包含字母和数字" autoComplete="new-password" />
              </Form.Item>

              <Form.Item<ChangePasswordFormValues>
                label="确认新密码"
                name="confirmPassword"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: '请再次输入新密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('两次输入的新密码不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Space>
                  <Button type="primary" htmlType="submit" loading={isSubmitting}>
                    更新密码
                  </Button>
                  <Button
                    onClick={() => {
                      form.resetFields();
                    }}
                    disabled={isSubmitting}
                  >
                    清空
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          <Card title={`权限列表 (${permissions.length})`}>
            {permissions.length ? (
              <div className="overflow-hidden rounded-lg border border-border-color">
                {permissions.map((permission, index) => (
                  <div
                    key={permission}
                    className={`px-3 py-2 ${
                      index === permissions.length - 1 ? '' : 'border-b border-border-color'
                    }`}
                  >
                    <code className="rounded bg-bg-subtle px-2 py-1 font-mono text-sm text-text-primary">
                      {permission}
                    </code>
                  </div>
                ))}
              </div>
            ) : (
              <Alert
                type="info"
                showIcon
                message="当前账号暂无权限记录"
                description="请联系系统管理员为该账号分配角色或权限。"
              />
            )}
          </Card>
        </Space>
      </Layout>
    </ProtectedRoute>
  );
}
