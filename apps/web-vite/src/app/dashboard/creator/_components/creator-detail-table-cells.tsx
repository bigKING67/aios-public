import type { TdHTMLAttributes, ThHTMLAttributes } from 'react';
import styles from './creator-live-dashboard.module.css';

function mergeClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

function withFixedLeftLastClass(className: string | undefined) {
  if (!className?.includes('ant-table-cell-fix-left-last')) {
    return className;
  }

  return mergeClassNames(className, styles.detailFixedLeftLastCell);
}

export function CreatorDetailHeaderCell({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={mergeClassNames(
        withFixedLeftLastClass(className),
        styles.detailHeaderCell
      )}
      {...props}
    />
  );
}

export function CreatorDetailBodyCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={mergeClassNames(
        withFixedLeftLastClass(className),
        styles.detailBodyCell
      )}
      {...props}
    />
  );
}
