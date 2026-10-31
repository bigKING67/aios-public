import type { TdHTMLAttributes, ThHTMLAttributes } from 'react';
import pipelineStyles from './dataops-pipeline-table.module.css';

function resolvePipelineTableCellClassName(className: string | undefined) {
  const classNames = [className];

  if (
    className?.includes('lobe-table-row-expand-icon-cell') ||
    className?.includes('lobe-table-selection-column')
  ) {
    classNames.push(pipelineStyles.pipelineCompactTableCell);
  }

  if (
    className?.includes('lobe-table-cell-fix-start') ||
    className?.includes('lobe-table-cell-fix-end')
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
