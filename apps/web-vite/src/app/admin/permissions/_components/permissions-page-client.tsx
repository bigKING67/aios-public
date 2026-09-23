'use client';

import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Table,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useIsMobile } from '@/hooks/use-media-query';
import { useBackendCapabilities } from '@/hooks/use-backend-capabilities';
import { ADMIN_READ_PERMISSIONS } from '@/lib/permissions';
import { PermissionsMobileList } from './permissions-mobile-list';
import { usePermissionsPageListState } from './permissions-page-list-state';
import { PERMISSIONS_TABLE_COLUMNS } from './permissions-table-columns';

export function PermissionsPageClient() {
  const isMobile = useIsMobile();
  const { data: backendCapabilities, isLoading: isCapabilitiesLoading } = useBackendCapabilities();
  const supportsPermissionsApi =
    backendCapabilities?.modules?.permissions ?? backendCapabilities?.supportsAdminApis ?? false;

  const {
    isLoading,
    isFetching,
    filteredPermissions,
    handleMobilePaginationChange,
    keyword,
    mobilePagedPermissions,
    mobilePageSize,
    mobilePaginationCurrent,
    moduleFilter,
    modules,
    permissions,
    refetch,
    setKeyword,
    setModuleFilter,
  } = usePermissionsPageListState({ supportsPermissionsApi });

  return (
    <ProtectedRoute
      requiredPermission={ADMIN_READ_PERMISSIONS}
      permissionMode="any"
    >
      <Layout>
        {!isCapabilitiesLoading && !supportsPermissionsApi ? (
          <Card title="权限管理">
            <Alert
              type="info"
              showIcon
              title="当前后端未启用权限管理接口"
              description={`检测到后端：${backendCapabilities?.backendName || 'unknown'}。当前环境的权限管理接口不可用，权限管理页已自动降级为提示态。`}
            />
          </Card>
        ) : null}
        {isCapabilitiesLoading ? (
          <Card title="权限管理">
            <Spin />
          </Card>
        ) : null}
        {!isCapabilitiesLoading && supportsPermissionsApi ? (
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card>
                  <PermissionMetric label="权限总数" value={permissions.length} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <PermissionMetric label="模块数量" value={modules.length} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <PermissionMetric label="筛选结果" value={filteredPermissions.length} />
                </Card>
              </Col>
            </Row>

            <Card>
              <Space wrap>
                <Input
                  allowClear
                  placeholder="搜索权限代码/名称/描述"
                  style={{ width: 'min(280px, 100%)' }}
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                <Select
                  value={moduleFilter}
                  style={{ width: 'min(180px, 100%)' }}
                  onChange={setModuleFilter}
                  options={[
                    { label: '全部模块', value: 'all' },
                    ...modules.map((module) => ({ label: module, value: module })),
                  ]}
                />
                <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()}>
                  刷新
                </Button>
              </Space>
            </Card>

            <Card title="权限管理">
              {isLoading ? (
                <Spin />
              ) : isMobile ? (
                <PermissionsMobileList
                  current={mobilePaginationCurrent}
                  items={mobilePagedPermissions}
                  onPaginationChange={handleMobilePaginationChange}
                  pageSize={mobilePageSize}
                  total={filteredPermissions.length}
                />
              ) : (
                <Table
                  rowKey={(record) => String(record.id ?? record.code)}
                  columns={PERMISSIONS_TABLE_COLUMNS}
                  dataSource={filteredPermissions}
                  pagination={{
                    pageSize: 20,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`,
                  }}
                  scroll={{ x: 1300 }}
                />
              )}
            </Card>
          </Space>
        ) : null}
      </Layout>
    </ProtectedRoute>
  );
}

function PermissionMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="block text-sm text-text-secondary">{label}</span>
      <strong className="mt-1 block font-mono text-2xl font-semibold tabular-nums text-text-primary">
        {value}
      </strong>
    </div>
  );
}
