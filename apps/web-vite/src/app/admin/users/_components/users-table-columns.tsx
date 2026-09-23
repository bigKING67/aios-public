import { Button, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { formatAdminDateTime } from '../../_components/admin-date-formatters';
import { getDisplayEmail } from './user-email-helpers';
import type { User } from '../_lib/users-types';

interface UsersTableColumnsOptions {
  onDelete: (user: User) => void;
  onEdit: (user: User) => void;
  onOpenRoleModal: (user: User) => void;
}

export function buildUsersTableColumns({
  onDelete,
  onEdit,
  onOpenRoleModal,
}: UsersTableColumnsOptions): ColumnsType<User> {
  return [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 150,
    },
    {
      title: '邮箱',
      key: 'email',
      dataIndex: 'email',
      render: (email: string) => getDisplayEmail(email),
      width: 200,
    },
    {
      title: '全名',
      dataIndex: 'full_name',
      key: 'full_name',
      width: 150,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>{isActive ? '活跃' : '禁用'}</Tag>
      ),
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => formatAdminDateTime(date),
      width: 170,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          />
          <Button type="text" size="small" onClick={() => onOpenRoleModal(record)}>
            角色
          </Button>
          <Popconfirm
            title="删除用户"
            description={`确定要删除用户 ${record.username} 吗？`}
            onConfirm={() => onDelete(record)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];
}
