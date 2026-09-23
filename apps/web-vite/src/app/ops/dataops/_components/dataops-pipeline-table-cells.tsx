import type { TdHTMLAttributes, ThHTMLAttributes } from 'react';
import pipelineStyles from './dataops-pipeline-table.module.css';

function resolvePipelineTableCellClassName(className: string | undefined) {
  const classNames = [className];

  if (
    className?.includes('ant-table-row-expand-icon-cell') ||
    className?.includes('ant-table-selection-column')
  ) {
    classNames.push(pipelineStyles.pipelineCompactTableCell);
  }

  if (
    className?.includes('ant-table-cell-fix-left') ||
    className?.includes('ant-table-cell-fix-right')
  ) {
    classNames.push(pipelineStyles.pipelineFixedCell);
  }

  return classNames.filter(Boolean).join(' ');
}

export function DataOpsPipelineTableHeaderCell({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={resolvePipelineTableCellClassName(className)} {...props} />;
}

export function DataOpsPipelineTableBodyCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={resolvePipelineTableCellClassName(className)} {...props} />;
}
