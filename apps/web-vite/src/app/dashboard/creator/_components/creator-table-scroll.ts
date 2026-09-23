import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';

interface ScrollColumnNode {
  width?: unknown;
  children?: ScrollColumnNode[];
}

function parseColumnWidth(width: unknown): number | null {
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
    return width;
  }

  if (typeof width === 'string') {
    const parsed = Number.parseFloat(width);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function walkColumnWidths(columns: ScrollColumnNode[], fallbackColumnWidth: number): number {
  let totalWidth = 0;

  for (const column of columns) {
    if (Array.isArray(column.children) && column.children.length) {
      totalWidth += walkColumnWidths(column.children, fallbackColumnWidth);
      continue;
    }

    totalWidth += parseColumnWidth(column.width) ?? fallbackColumnWidth;
  }

  return totalWidth;
}

export function resolveTableScrollX<T>(
  columns: ColumnsType<T>,
  fallbackColumnWidth = 140,
  minScrollX = 960,
  gutter = 48
): number {
  const totalWidth = walkColumnWidths(columns as ScrollColumnNode[], fallbackColumnWidth);
  return Math.max(Math.round(totalWidth + gutter), minScrollX);
}

export function useResolvedTableScrollX<T>(
  columns: ColumnsType<T>,
  fallbackColumnWidth = 140,
  minScrollX = 960,
  gutter = 48
): number {
  return useMemo(
    () => resolveTableScrollX(columns, fallbackColumnWidth, minScrollX, gutter),
    [columns, fallbackColumnWidth, minScrollX, gutter]
  );
}
