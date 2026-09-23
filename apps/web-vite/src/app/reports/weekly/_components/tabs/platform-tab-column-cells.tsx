import type { HTMLAttributes, ReactNode } from 'react';
import {
  WeeklyCurrencyTrendCell,
  WeeklyPlainTextCell,
  WeeklyPriorityTag,
  WeeklyRawMetricTrendCell,
  WeeklyTrendText,
  type WeeklyTrendZeroMode,
} from './weekly-primitives';
import {
  createWeeklyFrozenHeaderCellProps,
  createWeeklyTableCellProps,
} from './platform-tab-column-cell-props';

type WeeklyTableCellProps = Pick<HTMLAttributes<HTMLElement>, 'className'>;
type TrendClassNameResolver = (value: number | undefined) => string;
type WeeklyPlainTextCellVariant = 'reason' | 'goods-id' | 'goods-name';

export { createWeeklyFrozenHeaderCellProps };

export function createWeeklyGmvCellProps(): WeeklyTableCellProps {
  return createWeeklyTableCellProps('gmv');
}

export function createWeeklyGoodsIdCellProps(): WeeklyTableCellProps {
  return createWeeklyTableCellProps('goods-id');
}

export function createWeeklyFrozenGoodsIdCellProps(): WeeklyTableCellProps {
  return createWeeklyTableCellProps('goods-id', 'frozen-col');
}

export function createWeeklyFrozenGoodsNameCellProps(): WeeklyTableCellProps {
  return createWeeklyTableCellProps('goods-name', 'frozen-col');
}

export function renderWeeklyPlainTextCell(
  value: string,
  variant?: WeeklyPlainTextCellVariant
): ReactNode {
  return <WeeklyPlainTextCell variant={variant}>{value}</WeeklyPlainTextCell>;
}

export function renderWeeklyCurrencyTrendCell(
  currentValue: number,
  changePercent: number | undefined,
  resolveTrendClassName: TrendClassNameResolver
): ReactNode {
  return (
    <WeeklyCurrencyTrendCell
      currentValue={currentValue}
      changePercent={changePercent}
      resolveTrendClassName={resolveTrendClassName}
    />
  );
}

export function renderWeeklyRawMetricTrendCell(
  value: string,
  changePercent: number | undefined,
  resolveTrendClassName: TrendClassNameResolver
): ReactNode {
  return (
    <WeeklyRawMetricTrendCell
      value={value}
      changePercent={changePercent}
      resolveTrendClassName={resolveTrendClassName}
    />
  );
}

export function renderWeeklyTrendText(
  children: ReactNode,
  value: number | undefined,
  zeroMode?: WeeklyTrendZeroMode
): ReactNode {
  return (
    <WeeklyTrendText value={value} zeroMode={zeroMode}>
      {children}
    </WeeklyTrendText>
  );
}

export function renderWeeklyPriorityTag(value: ReactNode): ReactNode {
  return <WeeklyPriorityTag>{value}</WeeklyPriorityTag>;
}
