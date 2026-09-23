'use client';

import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Space,
  Spin,
  Table,
} from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useIsMobile } from '@/hooks/use-media-query';
import { useBackendCapabilities } from '@/hooks/use-backend-capabilities';
import { ADMIN_READ_PERMISSIONS } from '@/lib/permissions';
import { useAuditLogsListState } from './audit-logs-list-state';
import { AuditLogsMobileList } from './audit-logs-mobile-list';
import { buildAuditLogsTableColumns } from './audit-logs-table-columns';
import type { AuditFilters } from './audit-logs-types';

const AUDIT_LOGS_TABLE_COLUMNS = buildAuditLogsTableColumns();

export function AuditLogsPageClient() {
  const isMobile = useIsMobile();
  const { data: backendCapabilities, isLoading: isCapabilitiesLoading } = useBackendCapabilities();
  const supportsAuditLogsApi =
    backendCapabilities?.modules?.auditLogs ?? backendCapabilities?.supportsAdminApis ?? false;
  const [form] = Form.useForm<AuditFilters>();
  const {
    auditItems,
    auditTotal,
    isLoading,
    isFetching,
    page,
    pageSize,
    refetch,
    handleSearch,
    handleReset,
    handlePageChange,
    setPage,
    setPageSize,
  } = useAuditLogsListState({
    form,
    supportsAuditLogsApi,
  });

  return (
    <ProtectedRoute
      requiredPermission={ADMIN_READ_PERMISSIONS}
      permissionMode="any"
    >
      <Layout>
        {!isCapabilitiesLoading && !supportsAuditLogsApi ? (
          <Card title="审计日志">
            <Alert
              type="info"
              showIcon
              title="当前后端未启用审计日志接口"
              description={`检测到后端：${backendCapabilities?.backendName || 'unknown'}。当前环境的审计日志接口不可用，审计日志页已自动降级为提示态。`}
            />
          </Card>
        ) : null}
        {isCapabilitiesLoading ? (
          <Card title="审计日志">
            <Spin />
          </Card>
        ) : null}
        {!isCapabilitiesLoading && supportsAuditLogsApi ? (
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Card>
              <Form form={form} layout="vertical" onFinish={handleSearch}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Form.Item name="module" label="模块" className="!mb-0">
                    <Input placeholder="例如：user" allowClear />
                  </Form.Item>

                  <Form.Item name="action" label="动作" className="!mb-0">
                    <Input placeholder="例如：delete" allowClear />
                  </Form.Item>

                  <Form.Item name="keyword" label="关键词" className="!mb-0">
                    <Input placeholder="操作者或资源ID" allowClear />
                  </Form.Item>
                </div>

                <Form.Item className="!mb-0 mt-3">
                  <Space wrap>
                    <Button type="primary" icon={<SearchOutlined />} htmlType="submit">
                      查询
                    </Button>
                    <Button onClick={handleReset}>重置</Button>
                  </Space>
                </Form.Item>
              </Form>
            </Card>

            <Card
              title="审计日志"
              extra={
                <Button
                  icon={<ReloadOutlined />}
                  loading={isFetching}
                  onClick={() => refetch()}
                >
                  刷新
                </Button>
              }
            >
              {isLoading ? (
                <Spin />
              ) : isMobile ? (
                <AuditLogsMobileList
                  auditItems={auditItems}
                  page={page}
                  pageSize={pageSize}
                  total={auditTotal}
                  onChange={(nextPage, nextSize) => {
                    handlePageChange(nextPage, nextSize);
                  }}
                  onShowSizeChange={(nextPage, nextSize) => {
                    setPage(nextPage);
                    setPageSize(nextSize);
                  }}
                />
              ) : (
                <Table
                  rowKey="id"
                  columns={AUDIT_LOGS_TABLE_COLUMNS}
                  dataSource={auditItems}
                  pagination={{
                    current: page,
                    pageSize,
                    total: auditTotal,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`,
                    onChange: handlePageChange,
                  }}
                  scroll={{ x: 1200 }}
                />
              )}
            </Card>
          </Space>
        ) : null}
      </Layout>
    </ProtectedRoute>
  );
}
