import type { TdHTMLAttributes, ThHTMLAttributes } from 'react';
import notificationTableStyles from './dataops-notification-table.module.css';

function mergeClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

function resolveNotificationCellClassName(className: string | undefined) {
  return className?.includes('ant-table-row-expand-icon-cell')
    ? mergeClassNames(className, notificationTableStyles.notificationExpandCell)
    : className;
}

export function DataOpsNotificationTableHeaderCell({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={resolveNotificationCellClassName(className)} {...props} />;
}

export function DataOpsNotificationTableBodyCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={resolveNotificationCellClassName(className)} {...props} />;
}
