import { Empty, Table, Tooltip } from 'antd';
import type { TableProps } from 'antd/es/table';
import tableStyles from '../creator-library-table.module.css';
import {
  DEFAULT_CREATOR_LIBRARY_SORT,
  type CreatorLibraryItem,
} from '../_lib/creator-library-types';
import { isBlacklistCreator } from '../_lib/creator-library-options';
import { buildCreatorLibraryTableColumns } from './creator-library-table-columns';
import { buildCreatorLibraryPagination } from './creator-library-table-layout';
import { resolveSortFromTable } from './creator-library-table-sorting';
import type { CreatorLibraryTableProps } from './creator-library-table-types';

export function CreatorLibraryTable({
  items,
  total,
  page,
  pageSize,
  sort,
  loading,
  selectedRowKeys,
  onSelectionChange,
  onSortChange,
  onPageChange,
  onView,
  onEdit,
  onFollow,
  onAssign,
  onDelete,
}: CreatorLibraryTableProps) {
  const columns = buildCreatorLibraryTableColumns({
    sort,
    onView,
    onEdit,
    onFollow,
    onAssign,
    onDelete,
  });

  const handleTableChange: TableProps<CreatorLibraryItem>['onChange'] = (
    _pagination,
    _filters,
    sorter,
    extra
  ) => {
    if (extra.action !== 'sort') {
      return;
    }
    const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    const nextSort = activeSorter
      ? resolveSortFromTable(activeSorter.columnKey, activeSorter.order)
      : null;
    onSortChange(nextSort ?? DEFAULT_CREATOR_LIBRARY_SORT);
  };

  return (
    <section className={tableStyles.tableSurface}>
      <Table<CreatorLibraryItem>
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        scroll={{ x: 2170 }}
        locale={{
          emptyText: (
            <Empty
              description="没有找到匹配的达人"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        rowSelection={{
          selectedRowKeys,
          onChange: onSelectionChange,
          preserveSelectedRowKeys: true,
          getCheckboxProps: (record) => ({
            disabled: isBlacklistCreator(record),
          }),
          renderCell: (_checked, record, _index, originNode) =>
            isBlacklistCreator(record) ? (
              <Tooltip title="黑名单达人">
                <span className={tableStyles.blacklistSelectionMark} aria-label="黑名单达人">
                  ×
                </span>
              </Tooltip>
            ) : (
              originNode
            ),
        }}
        rowClassName={(record) => (isBlacklistCreator(record) ? tableStyles.blacklistRow : '')}
        onChange={handleTableChange}
        pagination={buildCreatorLibraryPagination(total, page, pageSize, onPageChange)}
      />
    </section>
  );
}
