import type { Key } from 'react';
import type { ColumnsType } from 'antd/es/table';
import {
  resolveResponsiveTableScroll,
  resolveResponsiveTableSize,
  type TablePaginationConfig,
} from './platform-tab-table-responsive';
import type { WeeklyDataTableProps } from './weekly-primitives';

export interface BuildFunnelTablePropsInput<RowType extends object> {
  isMobile: boolean;
  rows: RowType[];
  columns: ColumnsType<RowType>;
  rowKey: (record: RowType) => Key;
  pagination: TablePaginationConfig;
  mobileX: number;
  desktopX: number;
  desktopY?: number;
}

export function buildFunnelTableProps<RowType extends object>({
  isMobile,
  rows,
  columns,
  rowKey,
  pagination,
  mobileX,
  desktopX,
  desktopY,
}: BuildFunnelTablePropsInput<RowType>): WeeklyDataTableProps<RowType> {
  return {
    rowKey,
    dataSource: rows,
    columns,
    size: resolveResponsiveTableSize(isMobile),
    pagination,
    scroll: resolveResponsiveTableScroll({
      isMobile,
      mobileX,
      desktopX,
      desktopY,
    }),
  };
}
