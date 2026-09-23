'use client';

import type { Key } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { usePermission } from '@/hooks/use-permission';
import { resolveClientErrorMessage } from '@/lib/client-error';
import {
  CREATOR_LIBRARY_READ_PERMISSIONS,
  CREATOR_LIBRARY_WRITE_PERMISSIONS,
} from '@/lib/report-permissions';
import styles from '../creator-library.module.css';
import {
  fetchCreatorLibrary,
  fetchCreatorLibraryFilterOptions,
} from '../_lib/creator-library-api';
import { creatorLibraryQueryKeys } from '../_lib/creator-library-query-keys';
import {
  DEFAULT_CREATOR_LIBRARY_SORT,
  type CreatorLibraryFilters,
  type CreatorLibraryItem,
  type CreatorLibraryQueryParams,
  type CreatorLibrarySort,
} from '../_lib/creator-library-types';
import { resolveCreatorLibraryErrorDescription } from './creator-library-error-message';
import { useCreatorLibraryFileActions } from './creator-library-file-actions';
import {
  EMPTY_CREATOR_LIBRARY_FILTER_OPTIONS,
  mergeCreatorFilterOptions,
  normalizeCreatorFilterOptions,
} from './creator-library-filter-options-model';
import { CreatorLibraryAssignBdModal } from './creator-library-assign-bd-modal';
import { CreatorLibraryDetailDrawer } from './creator-library-detail-drawer';
import { CreatorLibraryFilters as CreatorLibraryFiltersPanel } from './creator-library-filters';
import { useCreatorLibraryFollowLogActions } from './creator-library-follow-log-actions';
import { CreatorLibraryFollowModal } from './creator-library-follow-modal';
import { useCreatorLibraryFollowLogs } from './creator-library-follow-logs';
import { CreatorLibraryFormDrawer } from './creator-library-form-drawer';
import { CreatorLibraryImportModal } from './creator-library-import-modal';
import { useCreatorLibraryRecordActions } from './creator-library-record-actions';
import { CreatorLibraryTable } from './creator-library-table';
import { CreatorLibraryToolbar } from './creator-library-toolbar';

export function CreatorLibraryClient() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const canCreateOrImport = usePermission(CREATOR_LIBRARY_WRITE_PERMISSIONS, 'any');
  const [filters, setFilters] = useState<CreatorLibraryFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<CreatorLibrarySort>(DEFAULT_CREATOR_LIBRARY_SORT);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [editingItem, setEditingItem] = useState<CreatorLibraryItem | null>(null);
  const [viewingItem, setViewingItem] = useState<CreatorLibraryItem | null>(null);
  const [followItem, setFollowItem] = useState<CreatorLibraryItem | null>(null);
  const [assignItem, setAssignItem] = useState<CreatorLibraryItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [missingPromptKeyword, setMissingPromptKeyword] = useState<string | null>(null);
  const [followLogRevision, setFollowLogRevision] = useState(0);

  const queryParams = useMemo<CreatorLibraryQueryParams>(
    () => ({
      ...filters,
      page,
      pageSize,
      sort,
    }),
    [filters, page, pageSize, sort]
  );

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: creatorLibraryQueryKeys.list(queryParams),
    queryFn: ({ signal }) => fetchCreatorLibrary(queryParams, { signal }),
  });
  const { data: filterOptionsData } = useQuery({
    queryKey: creatorLibraryQueryKeys.filterOptions(),
    queryFn: fetchCreatorLibraryFilterOptions,
    staleTime: 5 * 60 * 1000,
  });
  const followItemId = followItem?.id;
  const {
    data: followLogsData,
    error: followLogsError,
    isFetching: isFetchingFollowLogs,
  } = useCreatorLibraryFollowLogs(followItemId);

  const filterOptions = useMemo(
    () => normalizeCreatorFilterOptions(
      filterOptionsData ?? data?.filterOptions ?? EMPTY_CREATOR_LIBRARY_FILTER_OPTIONS
    ),
    [data?.filterOptions, filterOptionsData]
  );
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;
  const resolvedFilterOptions = useMemo(
    () => mergeCreatorFilterOptions(filterOptions, items),
    [filterOptions, items]
  );

  const refreshLibrary = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: creatorLibraryQueryKeys.lists(),
    });
  }, [queryClient]);

  const refreshActiveCreatorFollowLogs = useCallback(
    (creatorId: number) => {
      queryClient.invalidateQueries({
        queryKey: creatorLibraryQueryKeys.followLogs(creatorId),
        exact: true,
      });
    },
    [queryClient]
  );

  const refreshCreatorFilterOptions = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: creatorLibraryQueryKeys.filterOptions(),
      exact: true,
    });
  }, [queryClient]);

  const {
    createMutation,
    deleteMutation,
    handleSave,
    handleUpdateExisting,
    updateMutation,
  } = useCreatorLibraryRecordActions({
    messageApi: message,
    editingItem,
    refreshLibrary,
    refreshCreatorFilterOptions,
    setFormOpen,
    setEditingItem,
    setFollowItem,
    setAssignItem,
    setSelectedRowKeys,
  });
  const {
    createFollowLogMutation,
    deleteFollowLogMutation,
    updateFollowLogMutation,
  } = useCreatorLibraryFollowLogActions({
    messageApi: message,
    followItem,
    refreshLibrary,
    refreshActiveCreatorFollowLogs,
    setFollowLogRevision,
  });

  const { exportMutation, importMutation, templateMutation } = useCreatorLibraryFileActions({
    messageApi: message,
    queryParams,
    onImportClose: () => setImportOpen(false),
    onImportSuccess: (importedCount) => {
      refreshLibrary();
      if (importedCount > 0) {
        refreshCreatorFilterOptions();
      }
    },
  });

  useEffect(() => {
    if (!missingPromptKeyword || isLoading || isFetching || error || !data) {
      return;
    }

    const activeKeyword = queryParams.keyword?.trim();
    if (activeKeyword !== missingPromptKeyword) {
      return;
    }

    if (data.total > 0) {
      setMissingPromptKeyword(null);
      return;
    }

    setMissingPromptKeyword(null);
    modal.confirm({
      title: '达人库未有该达人',
      content: '是否新增达人入库信息？',
      okText: '新增达人',
      cancelText: '取消',
      onOk: () => {
        setEditingItem(null);
        setFormOpen(true);
      },
    });
  }, [
    data,
    error,
    isFetching,
    isLoading,
    missingPromptKeyword,
    modal,
    queryParams.keyword,
  ]);

  const handleSearch = useCallback((nextFilters: CreatorLibraryFilters) => {
    const keyword = nextFilters.keyword?.trim() || null;
    setMissingPromptKeyword(keyword);
    setPage(1);
    setFilters(nextFilters);
    setSelectedRowKeys([]);
  }, []);

  const handleReset = useCallback(() => {
    setMissingPromptKeyword(null);
    setPage(1);
    setFilters({});
    setSelectedRowKeys([]);
  }, []);

  return (
    <ProtectedRoute requiredPermission={CREATOR_LIBRARY_READ_PERMISSIONS} permissionMode="any">
      <Layout>
        <main className={styles.pageShell}>
          <section className={styles.overviewPanel}>
            <section className={styles.heroPanel}>
              <div className={styles.heroCopy}>
                <h1>达人库</h1>
                <p>
                  统一管理达人筛选、建联跟进、BD 分配、批量导入与筛选导出。
                </p>
              </div>
              <Link to="/marketing" className={styles.backLink}>
                <ArrowLeftOutlined />
                返回营销总览
              </Link>
            </section>

            <CreatorLibraryFiltersPanel
              filters={filters}
              filterOptions={resolvedFilterOptions}
              onSearch={handleSearch}
              onReset={handleReset}
            />
          </section>

          {error ? (
            <Alert
              type="error"
              showIcon
              title="达人库加载失败"
              description={resolveCreatorLibraryErrorDescription(error)}
            />
          ) : null}

          <section className={styles.tableWorkspace}>
            <CreatorLibraryToolbar
              selectedCount={selectedRowKeys.length}
              canCreateOrImport={canCreateOrImport}
              exporting={exportMutation.isPending}
              onCreate={() => {
                setEditingItem(null);
                setFormOpen(true);
              }}
              onImport={() => setImportOpen(true)}
              onDownloadTemplate={() => templateMutation.mutate()}
              onExport={() => exportMutation.mutate()}
            />

            {isLoading && !data ? (
              <div className={styles.loadingSurface}>
                <Spin />
              </div>
            ) : null}

            <CreatorLibraryTable
              items={items}
              total={total}
              page={page}
              pageSize={pageSize}
              sort={sort}
              loading={isFetching}
              selectedRowKeys={selectedRowKeys}
              onSelectionChange={setSelectedRowKeys}
              onSortChange={(nextSort) => {
                setSort(nextSort);
                setPage(1);
              }}
              onPageChange={(nextPage, nextPageSize) => {
                setPage(nextPageSize !== pageSize ? 1 : nextPage);
                setPageSize(nextPageSize);
              }}
              onView={setViewingItem}
              onEdit={(item) => {
                setEditingItem(item);
                setFormOpen(true);
              }}
              onFollow={setFollowItem}
              onAssign={setAssignItem}
              onDelete={(item) =>
                deleteMutation.mutate({
                  id: item.id,
                  expectedUpdatedAt: item.updatedAt,
                })
              }
            />
          </section>
        </main>

        <CreatorLibraryFormDrawer
          open={formOpen}
          saving={createMutation.isPending || updateMutation.isPending}
          item={editingItem}
          filterOptions={resolvedFilterOptions}
          onSubmit={handleSave}
          onClose={() => {
            setFormOpen(false);
            setEditingItem(null);
          }}
        />
        <CreatorLibraryDetailDrawer
          item={viewingItem}
          open={!!viewingItem}
          onClose={() => setViewingItem(null)}
        />
        <CreatorLibraryFollowModal
          key={`${followItem?.id ?? 'empty'}-${followLogRevision}`}
          item={followItem}
          open={!!followItem}
          logs={followLogsData?.items ?? []}
          loading={isFetchingFollowLogs}
          loadErrorMessage={
            followLogsError
              ? resolveClientErrorMessage(followLogsError, '跟进历史加载失败，请刷新后重试')
              : null
          }
          saving={createFollowLogMutation.isPending || updateFollowLogMutation.isPending}
          deletingLogId={
            deleteFollowLogMutation.isPending
              ? deleteFollowLogMutation.variables?.logId ?? null
              : null
          }
          onCreate={(payload) => {
            if (!followItem) {
              return;
            }
            createFollowLogMutation.mutate({ creatorId: followItem.id, payload });
          }}
          onUpdate={(logId, payload) => {
            if (!followItem) {
              return;
            }
            updateFollowLogMutation.mutate({ creatorId: followItem.id, logId, payload });
          }}
          onDelete={(logId, expectedUpdatedAt) => {
            if (!followItem) {
              return;
            }
            deleteFollowLogMutation.mutate({
              creatorId: followItem.id,
              logId,
              expectedUpdatedAt,
            });
          }}
          onCancel={() => setFollowItem(null)}
        />
        <CreatorLibraryAssignBdModal
          item={assignItem}
          open={!!assignItem}
          saving={updateMutation.isPending}
          filterOptions={resolvedFilterOptions}
          onSubmit={(payload) => handleUpdateExisting(assignItem, payload)}
          onCancel={() => setAssignItem(null)}
        />
        <CreatorLibraryImportModal
          open={importOpen}
          importing={importMutation.isPending}
          onImport={(rows) => importMutation.mutate(rows)}
          onCancel={() => setImportOpen(false)}
        />
      </Layout>
    </ProtectedRoute>
  );
}
