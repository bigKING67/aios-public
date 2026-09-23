import type { TdHTMLAttributes, ThHTMLAttributes } from "react";

import styles from "../sample-inventory.module.css";

function mergeClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function sampleInventoryTableHeaderCell({
  className,
  style,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  const { textAlign: _columnTextAlign, ...headerStyle } = style ?? {};
  return (
    <th
      className={mergeClassNames(styles.tableHeaderCell, styles.centeredTableHeaderCell, className)}
      style={headerStyle}
      {...props}
    />
  );
}

function sampleInventoryTableBodyCell({
  className,
  style,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  const { textAlign: _columnTextAlign, ...bodyStyle } = style ?? {};
  return (
    <td
      className={mergeClassNames(styles.tableBodyCell, styles.centeredTableBodyCell, className)}
      style={bodyStyle}
      {...props}
    />
  );
}

export const sampleInventoryTableComponents = {
  header: {
    cell: sampleInventoryTableHeaderCell,
  },
  body: {
    cell: sampleInventoryTableBodyCell,
  },
};
