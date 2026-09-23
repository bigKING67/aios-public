'use client';

import { Alert, Form, Input, Modal } from 'antd';
import type { FormInstance } from 'antd';
import type { User, UserFormValues } from '../_lib/users-types';

export interface UserFormModalProps {
  form: FormInstance<UserFormValues>;
  user: User | null;
  open: boolean;
  isSaving: boolean;
  onSubmit: (values: UserFormValues) => void;
  onCancel: () => void;
}

export function UserFormModal({
  form,
  user,
  open,
  isSaving,
  onSubmit,
  onCancel,
}: UserFormModalProps) {
  const isEditing = !!user;

  return (
    <Modal
      title={isEditing ? '编辑用户' : '新建用户'}
      open={open}
      onOk={form.submit}
      onCancel={onCancel}
      confirmLoading={isSaving}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
      >
        {!isEditing && (
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 个字符' },
            ]}
          >
            <Input placeholder="输入用户名" />
          </Form.Item>
        )}

        {!isEditing && (
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '密码至少 8 个字符' },
              {
                validator: (_, value) => {
                  if (!value || typeof value !== 'string') {
                    return Promise.resolve();
                  }
                  const hasLetter = /[A-Za-z]/.test(value);
                  const hasDigit = /\d/.test(value);
                  if (!hasLetter || !hasDigit) {
                    return Promise.reject(new Error('密码需包含字母和数字'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.Password placeholder="至少 8 位，包含字母和数字" />
          </Form.Item>
        )}

        {!isEditing ? (
          <Alert
            className="mb-4"
            type="info"
            showIcon
            title="新建用户仅需账号和密码，邮箱将由系统自动生成内部占位值。"
          />
        ) : null}

        <Form.Item
          name="full_name"
          label="全名"
        >
          <Input placeholder="输入全名" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
