import { Button, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { isReservedElevatedRoleCode } from '@/lib/role-access';
import { formatAdminDateTime } from '../../_components/admin-date-formatters';
import type { Role } from './roles-types';

interface RolesTableColumnsOptions {
  canManageElevatedRoles: boolean;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export function buildRolesTableColumns({
  canManageElevatedRoles,
  onEdit,
  onDelete,
}: RolesTableColumnsOptions): ColumnsType<Role> {
  return [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: '角色编码',
      dataIndex: 'code',
      key: 'code',
      width: 180,
      render: (code?: string) => <code>{code || '-'}</code>,
    },
    {
      title: '权限数',
      key: 'permissions_count',
      width: 100,
      render: (_, record) => {
        const count = record.permissions_count ?? record.permissions?.length ?? 0;
        return <Tag color="blue">{count}</Tag>;
      },
    },
    {
      title: '成员数',
      key: 'user_count',
      width: 100,
      render: (_, record) => <Tag>{record.user_count ?? 0}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive?: boolean) => (
        <Tag color={isActive === false ? 'default' : 'green'}>
          {isActive === false ? '禁用' : '启用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value?: string) => formatAdminDateTime(value),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => {
        const isReservedElevatedRole = isReservedElevatedRoleCode(record.code);
        const operationDisabled = !canManageElevatedRoles && isReservedElevatedRole;

        return (
          <Space size="small">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              disabled={operationDisabled}
              onClick={() => onEdit(record)}
            />
            <Popconfirm
              title="删除角色"
              description={`确定删除角色「${record.name}」吗？`}
              okText="删除"
              cancelText="取消"
              disabled={operationDisabled}
              onConfirm={() => onDelete(record)}
            >
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={operationDisabled}
              />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];
}
