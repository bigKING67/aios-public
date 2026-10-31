'use client';

import { Alert, Button, Input, Select, Table } from '@lobehub/ui';
import { MetricStrip, PageHeader, Surface } from '@lobehub/ui/dashboard';
import { RotateCw } from 'lucide-react';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useIsMobile } from '@/hooks/use-media-query';
import { useBackendCapabilities } from '@/hooks/use-backend-capabilities';
import { ADMIN_READ_PERMISSIONS } from '@/lib/permissions';
import styles from '../../_components/admin-page.module.css';
import { PermissionsMobileList } from './permissions-mobile-list';
import { usePermissionsPageListState } from './permissions-page-list-state';
import { PERMISSIONS_TABLE_COLUMNS } from './permissions-table-columns';
import type { PermissionItem } from './permissions-types';

const MODULE_SELECT_ID = 'admin-permissions-module';

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
        <section className={styles.page} aria-labelledby="admin-permissions-title" aria-busy={isCapabilitiesLoading || isLoading}>
          <PageHeader title={<span id="admin-permissions-title">权限管理</span>} />
          {isCapabilitiesLoading ? <Surface loading /> : null}
          {!isCapabilitiesLoading && !supportsPermissionsApi ? (
            <Alert
              type="info"
              showIcon
              title="当前后端未启用权限管理接口"
              description={`检测到后端：${backendCapabilities?.backendName || 'unknown'}。当前环境的权限管理接口不可用，权限管理页已自动降级为提示态。`}
            />
          ) : null}
          {!isCapabilitiesLoading && supportsPermissionsApi ? (
            <>
              <MetricStrip
                items={[
                  { label: '权限总数', value: permissions.length },
                  { label: '模块数量', value: modules.length },
                  { label: '筛选结果', value: filteredPermissions.length },
                ]}
              />

              <div className={styles.toolbar} role="search" aria-label="筛选权限">
                <div className={styles.searchInput}>
                  <Input
                    allowClear
                    aria-label="搜索权限代码/名称/描述"
                    placeholder="搜索权限代码/名称/描述"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    onClear={() => setKeyword('')}
                  />
                </div>
                {/* lobe Select does not forward aria-label: an sr-only label names it. */}
                <div className={styles.moduleSelect}>
                  <label className="sr-only" htmlFor={MODULE_SELECT_ID}>
                    模块
                  </label>
                  <Select
                    id={MODULE_SELECT_ID}
                    value={moduleFilter}
                    style={{ width: '100%' }}
                    onChange={(value) => typeof value === 'string' && setModuleFilter(value)}
                    options={[
                      { label: '全部模块', value: 'all' },
                      ...modules.map((module) => ({ label: module, value: module })),
                    ]}
                  />
                </div>
                <Button
                  icon={<RotateCw size={16} strokeWidth={1.8} aria-hidden="true" />}
                  loading={isFetching}
                  onClick={() => refetch()}
                >
                  刷新
                </Button>
              </div>

              {isLoading ? (
                <Surface loading />
              ) : isMobile ? (
                <PermissionsMobileList
                  current={mobilePaginationCurrent}
                  items={mobilePagedPermissions}
                  onPaginationChange={handleMobilePaginationChange}
                  pageSize={mobilePageSize}
                  total={filteredPermissions.length}
                />
              ) : (
                <Surface bleed>
                  <Table<PermissionItem>
                    rowKey={(record) => String(record.id ?? record.code)}
                    columns={PERMISSIONS_TABLE_COLUMNS}
                    dataSource={filteredPermissions}
                    pagination={{
                      pageSize: 20,
                      showSizeChanger: true,
                      showTotal: (total) => `共 ${total} 条`,
                    }}
                    scroll={{ x: 'max-content' }}
                  />
                </Surface>
              )}
            </>
          ) : null}
        </section>
      </Layout>
    </ProtectedRoute>
  );
}
