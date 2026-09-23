import type { Key } from 'react';
import type { ColumnsType } from 'antd/es/table';
import {
  resolveResponsiveTablePagination,
  resolveResponsiveTableScroll,
  resolveResponsiveTableSize,
} from './platform-tab-table-responsive';
import type { WeeklyDataTableProps } from './weekly-primitives';

export type AttributionTableProps<RowType extends object> = WeeklyDataTableProps<RowType> | null;

interface BuildAttributionTablePropsInput<RowType extends object> {
  isMobile: boolean;
  rows: RowType[];
  columns: ColumnsType<RowType>;
  rowKey: (record: RowType) => Key;
  mobileX: number;
  desktopX: number;
  desktopY?: number;
}

export function buildAttributionTableProps<RowType extends object>({
  isMobile,
  rows,
  columns,
  rowKey,
  mobileX,
  desktopX,
  desktopY = 420,
}: BuildAttributionTablePropsInput<RowType>): AttributionTableProps<RowType> {
  if (rows.length === 0) {
    return null;
  }

  return {
    rowKey,
    dataSource: rows,
    columns,
    size: resolveResponsiveTableSize(isMobile),
    pagination: resolveResponsiveTablePagination({ isMobile }),
    scroll: resolveResponsiveTableScroll({
      isMobile,
      mobileX,
      desktopX,
      desktopY,
    }),
  };
}
