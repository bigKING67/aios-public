import type { TableProps } from 'antd';

export type TablePaginationConfig = TableProps<object>['pagination'];
export type TableScrollConfig = NonNullable<TableProps<object>['scroll']>;
export type TableSizeConfig = TableProps<object>['size'];

export interface ResponsiveTablePaginationParams {
  isMobile: boolean;
  mobilePageSize?: number;
}

export interface ResponsiveTableScrollParams {
  isMobile: boolean;
  mobileX: number;
  desktopX: number;
  desktopY?: number;
}

export function resolveResponsiveTableSize(isMobile: boolean): TableSizeConfig {
  return isMobile ? 'small' : 'middle';
}

export function resolveResponsiveTablePagination({
  isMobile,
  mobilePageSize = 8,
}: ResponsiveTablePaginationParams): TablePaginationConfig {
  return isMobile ? { pageSize: mobilePageSize, showSizeChanger: false } : false;
}

export function resolveResponsiveTableScroll({
  isMobile,
  mobileX,
  desktopX,
  desktopY,
}: ResponsiveTableScrollParams): TableScrollConfig {
  if (isMobile) {
    return { x: mobileX };
  }

  return typeof desktopY === 'number'
    ? { x: desktopX, y: desktopY }
    : { x: desktopX };
}
