import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { Table, type TableProps } from '@lobehub/ui';
import { mergeWeeklyClassNames } from './weekly-class-names';
import styles from './weekly-table.module.css';

type WeeklyDataTableVariant = 'default' | 'quant';

// `variant` picks the weekly cell styling; lobe Table's own visual `variant` keeps its default (borderless).
export type WeeklyDataTableProps<RecordType extends object> = Omit<TableProps<RecordType>, 'variant'> & {
  variant?: WeeklyDataTableVariant;
};

function resolveWeeklyTableCellClassName(
  className: string | undefined,
  baseClassName: string,
  variantClassName: string | undefined,
  fixedLeftClassName: string,
  fixedLeftLastClassName: string
) {
  const isFixedLeft = className?.includes('lobe-table-cell-fix-start');
  const isFixedLeftLast = className?.includes('lobe-table-cell-fix-start-shadow');

  return mergeWeeklyClassNames(
    className,
    baseClassName,
    variantClassName,
    isFixedLeft ? fixedLeftClassName : styles.weeklyTableScrollableCell,
    isFixedLeftLast ? fixedLeftLastClassName : undefined
  );
}

function WeeklyDefaultHeaderCell({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={resolveWeeklyTableCellClassName(
        className,
        styles.weeklyTableHeaderCell,
        undefined,
        styles.weeklyTableHeaderFixedLeftCell,
        styles.weeklyTableHeaderFixedLeftLastCell
      )}
      {...props}
    />
  );
}

function WeeklyDefaultBodyCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={resolveWeeklyTableCellClassName(
        className,
        styles.weeklyTableBodyCell,
        undefined,
        styles.weeklyTableBodyFixedLeftCell,
        styles.weeklyTableBodyFixedLeftLastCell
      )}
      {...props}
    />
  );
}

function WeeklyQuantHeaderCell({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={resolveWeeklyTableCellClassName(
        className,
        styles.weeklyTableHeaderCell,
        styles.weeklyQuantHeaderCell,
        styles.weeklyTableHeaderFixedLeftCell,
        styles.weeklyTableHeaderFixedLeftLastCell
      )}
      {...props}
    />
  );
}

function WeeklyQuantBodyCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={resolveWeeklyTableCellClassName(
        className,
        styles.weeklyTableBodyCell,
        styles.weeklyQuantBodyCell,
        styles.weeklyTableBodyFixedLeftCell,
        styles.weeklyTableBodyFixedLeftLastCell
      )}
      {...props}
    />
  );
}

function WeeklyBodyRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={mergeWeeklyClassNames(className, styles.weeklyTableBodyRow)}
      {...props}
    />
  );
}

const weeklyDefaultTableComponents = {
  header: {
    cell: WeeklyDefaultHeaderCell,
  },
  body: {
    row: WeeklyBodyRow,
    cell: WeeklyDefaultBodyCell,
  },
};

const weeklyQuantTableComponents = {
  header: {
    cell: WeeklyQuantHeaderCell,
  },
  body: {
    row: WeeklyBodyRow,
    cell: WeeklyQuantBodyCell,
  },
};

function resolveWeeklyTableComponents<RecordType extends object>(
  components: TableProps<RecordType>['components'],
  variant: WeeklyDataTableVariant
): TableProps<RecordType>['components'] {
  const tableComponents = variant === 'quant'
    ? weeklyQuantTableComponents
    : weeklyDefaultTableComponents;

  if (!components) {
    return tableComponents;
  }

  return {
    ...components,
    header: {
      ...components.header,
      cell: tableComponents.header.cell,
    },
    body: {
      ...components.body,
      row: tableComponents.body.row,
      cell: tableComponents.body.cell,
    },
  };
}

export function WeeklyDataTable<RecordType extends object>({
  variant = 'default',
  className,
  components,
  ...props
}: WeeklyDataTableProps<RecordType>) {
  const tableClassName = [
    styles.goodsDataTable,
    variant === 'quant' ? styles.quantDataTable : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Table<RecordType>
      className={tableClassName}
      components={resolveWeeklyTableComponents(components, variant)}
      {...props}
    />
  );
}
