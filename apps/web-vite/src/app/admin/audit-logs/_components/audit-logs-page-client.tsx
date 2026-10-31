'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Input, Table } from '@lobehub/ui';
import { PageHeader, Surface } from '@lobehub/ui/dashboard';
import { RotateCw, Search } from 'lucide-react';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useIsMobile } from '@/hooks/use-media-query';
import { useBackendCapabilities } from '@/hooks/use-backend-capabilities';
import { ADMIN_READ_PERMISSIONS } from '@/lib/permissions';
import styles from '../../_components/admin-page.module.css';
import { useAuditLogsListState } from './audit-logs-list-state';
import { AuditLogsMobileList } from './audit-logs-mobile-list';
import { buildAuditLogsTableColumns } from './audit-logs-table-columns';
import type { AuditFilters, AuditLog } from './audit-logs-types';

const AUDIT_LOGS_TABLE_COLUMNS = buildAuditLogsTableColumns();
const FILTER_FIELDS: ReadonlyArray<{ key: keyof AuditFilters; label: string; placeholder: string }> = [
  { key: 'module', label: '模块', placeholder: '例如：user' },
  { key: 'action', label: '动作', placeholder: '例如：delete' },
  { key: 'keyword', label: '关键词', placeholder: '操作者或资源ID' },
];

export function AuditLogsPageClient() {
  const isMobile = useIsMobile();
  const { data: backendCapabilities, isLoading: isCapabilitiesLoading } = useBackendCapabilities();
  const supportsAuditLogsApi =
    backendCapabilities?.modules?.auditLogs ?? backendCapabilities?.supportsAdminApis ?? false;
  const [draft, setDraft] = useState<AuditFilters>({});
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
    supportsAuditLogsApi,
  });
  const ready = !isCapabilitiesLoading && supportsAuditLogsApi;

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSearch(draft);
  };
  const resetFilters = () => {
    setDraft({});
    handleReset();
  };

  return (
    <ProtectedRoute
      requiredPermission={ADMIN_READ_PERMISSIONS}
      permissionMode="any"
    >
      <Layout>
        <section className={styles.page} aria-labelledby="admin-audit-logs-title" aria-busy={isCapabilitiesLoading || isLoading}>
          <PageHeader
            title={<span id="admin-audit-logs-title">审计日志</span>}
            action={
              ready ? (
                <Button
                  icon={<RotateCw size={16} strokeWidth={1.8} aria-hidden="true" />}
                  loading={isFetching}
                  onClick={() => refetch()}
                >
                  刷新
                </Button>
              ) : undefined
            }
          />
          {isCapabilitiesLoading ? <Surface loading /> : null}
          {!isCapabilitiesLoading && !supportsAuditLogsApi ? (
            <Alert
              type="info"
              showIcon
              title="当前后端未启用审计日志接口"
              description={`检测到后端：${backendCapabilities?.backendName || 'unknown'}。当前环境的审计日志接口不可用，审计日志页已自动降级为提示态。`}
            />
          ) : null}
          {ready ? (
            <>
              <Surface padded>
                <form className={styles.form} role="search" aria-label="筛选审计日志" onSubmit={submitFilters}>
                  <div className={styles.filters}>
                    {FILTER_FIELDS.map((field) => (
                      <div key={field.key} className={styles.field}>
                        <label htmlFor={`audit-filter-${field.key}`} className={styles.label}>
                          {field.label}
                        </label>
                        <Input
                          id={`audit-filter-${field.key}`}
                          placeholder={field.placeholder}
                          allowClear
                          value={draft[field.key] ?? ''}
                          onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                          onClear={() => setDraft((current) => ({ ...current, [field.key]: '' }))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className={styles.toolbar}>
                    <Button type="primary" icon={<Search size={16} strokeWidth={1.8} aria-hidden="true" />} htmlType="submit">
                      查询
                    </Button>
                    <Button onClick={resetFilters}>重置</Button>
                  </div>
                </form>
              </Surface>

              {isLoading ? (
                <Surface loading />
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
                <Surface bleed>
                  <Table<AuditLog>
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
