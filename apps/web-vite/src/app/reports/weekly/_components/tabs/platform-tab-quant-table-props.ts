import type { Key } from 'react';
import type { ColumnsType } from 'antd/es/table';
import {
  resolveResponsiveTablePagination,
  resolveResponsiveTableScroll,
  resolveResponsiveTableSize,
} from './platform-tab-table-responsive';
import type { QuantAttributionRow } from './platform-tab-types';
import type { WeeklyDataTableProps } from './weekly-primitives';

interface BuildQuantTablePropsInput {
  isMobile: boolean;
  rows: QuantAttributionRow[];
  columns: ColumnsType<QuantAttributionRow>;
  rowKey: (record: QuantAttributionRow) => Key;
}

export type QuantTableProps = WeeklyDataTableProps<QuantAttributionRow> | null;

export function buildQuantTableProps({
  isMobile,
  rows,
  columns,
  rowKey,
}: BuildQuantTablePropsInput): QuantTableProps {
  if (rows.length === 0) {
    return null;
  }

  return {
    variant: 'quant',
    rowKey,
    dataSource: rows,
    columns,
    size: resolveResponsiveTableSize(isMobile),
    pagination: resolveResponsiveTablePagination({ isMobile }),
    scroll: resolveResponsiveTableScroll({
      isMobile,
      mobileX: 1180,
      desktopX: 1650,
      desktopY: 360,
    }),
  };
}
