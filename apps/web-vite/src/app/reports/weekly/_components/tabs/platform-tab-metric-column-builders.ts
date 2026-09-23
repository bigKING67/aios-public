import type { ColumnsType } from 'antd/es/table';
import {
  formatCurrencyFixed,
  formatInteger,
  formatRatioPercent,
  formatSignedCurrency,
  formatSignedPercent,
} from './platform-tab-formatters';
import { createWeeklyMetricCellProps } from './platform-tab-column-cell-props';

type WeeklyMetricColumn<Row extends object> = ColumnsType<Row>[number];
type WeeklyMetricField<Row extends object> = Extract<keyof Row, string> | string;
type WeeklyMetricFormatter<Row extends object, Key extends WeeklyMetricField<Row>> = (
  value: Row[Key & keyof Row],
  record: Row
) => string;

interface WeeklyMetricColumnConfig<
  Row extends object,
  Key extends WeeklyMetricField<Row>,
> {
  title: string;
  dataIndex: Key;
  width: number;
  formatter: WeeklyMetricFormatter<Row, Key>;
}

function buildMetricColumn<
  Row extends object,
  Key extends WeeklyMetricField<Row>,
>({
  title,
  dataIndex,
  width,
  formatter,
}: WeeklyMetricColumnConfig<Row, Key>): WeeklyMetricColumn<Row> {
  return {
    title,
    dataIndex,
    key: dataIndex,
    width,
    onCell: createWeeklyMetricCellProps,
    render: (value: Row[Extract<Key, keyof Row>], record: Row) =>
      formatter(value as Row[Key & keyof Row], record),
  } as WeeklyMetricColumn<Row>;
}

export function createFormattedMetricColumn<
  Row extends object,
  Key extends WeeklyMetricField<Row> = WeeklyMetricField<Row>,
>(
  title: string,
  dataIndex: Key,
  width: number,
  formatter: WeeklyMetricFormatter<Row, Key>
): WeeklyMetricColumn<Row> {
  return buildMetricColumn({
    title,
    dataIndex,
    width,
    formatter,
  });
}

export function createIntegerMetricColumn<
  Row extends object,
  Key extends WeeklyMetricField<Row> = WeeklyMetricField<Row>,
>(
  title: string,
  dataIndex: Key,
  width: number
): WeeklyMetricColumn<Row> {
  return createFormattedMetricColumn<Row, Key>(
    title,
    dataIndex,
    width,
    (value) => formatInteger(value as number | undefined)
  );
}

export function createCurrencyFixedMetricColumn<
  Row extends object,
  Key extends WeeklyMetricField<Row> = WeeklyMetricField<Row>,
>(
  title: string,
  dataIndex: Key,
  width: number,
  digits = 2
): WeeklyMetricColumn<Row> {
  return createFormattedMetricColumn<Row, Key>(
    title,
    dataIndex,
    width,
    (value) => formatCurrencyFixed(value as number | undefined, digits)
  );
}

export function createRatioPercentMetricColumn<
  Row extends object,
  Key extends WeeklyMetricField<Row> = WeeklyMetricField<Row>,
>(
  title: string,
  dataIndex: Key,
  width: number,
  digits = 2
): WeeklyMetricColumn<Row> {
  return createFormattedMetricColumn<Row, Key>(
    title,
    dataIndex,
    width,
    (value) => formatRatioPercent(value as number | undefined, digits)
  );
}

export function createSignedCurrencyMetricColumn<
  Row extends object,
  Key extends WeeklyMetricField<Row> = WeeklyMetricField<Row>,
>(
  title: string,
  dataIndex: Key,
  width: number
): WeeklyMetricColumn<Row> {
  return createFormattedMetricColumn<Row, Key>(
    title,
    dataIndex,
    width,
    (value) => formatSignedCurrency(value as number | undefined)
  );
}

export function createSignedPercentMetricColumn<
  Row extends object,
  Key extends WeeklyMetricField<Row> = WeeklyMetricField<Row>,
>(
  title: string,
  dataIndex: Key,
  width: number,
  digits = 0
): WeeklyMetricColumn<Row> {
  return createFormattedMetricColumn<Row, Key>(
    title,
    dataIndex,
    width,
    (value) => formatSignedPercent(value as number | undefined, digits)
  );
}
