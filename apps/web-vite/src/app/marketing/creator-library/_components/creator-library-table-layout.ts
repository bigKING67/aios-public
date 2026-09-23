import type { TablePaginationConfig } from 'antd/es/table';
import tableStyles from '../creator-library-table.module.css';
import type {
  CreatorLibraryCellAlign,
  CreatorLibraryTableCellProps,
} from './creator-library-table-types';

export function createTableHeaderCellProps(): CreatorLibraryTableCellProps {
  return {
    className: `${tableStyles.tableHeaderCell} ${tableStyles.tableCellCenter}`,
  };
}

export function createTableBodyCellProps(
  align: CreatorLibraryCellAlign = 'center'
): CreatorLibraryTableCellProps {
  return {
    className: `${tableStyles.tableBodyCell} ${
      align === 'right' ? tableStyles.tableCellRight : tableStyles.tableCellCenter
    }`,
  };
}

export function buildCreatorLibraryPagination(
  total: number,
  page: number,
  pageSize: number,
  onPageChange: (page: number, pageSize: number) => void
): TablePaginationConfig {
  return {
    total,
    current: page,
    pageSize,
    showSizeChanger: true,
    pageSizeOptions: [10, 20, 50, 100],
    showTotal: (value) => `共 ${value.toLocaleString('zh-CN')} 个达人`,
    onChange: onPageChange,
  };
}
