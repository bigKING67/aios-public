import type { HTMLAttributes } from 'react';
import { mergeWeeklyClassNames } from './weekly-class-names';
import styles from './weekly-table.module.css';

type WeeklyTableCellProps = Pick<HTMLAttributes<HTMLElement>, 'className'>;

export type WeeklyTableCellRole =
  | 'gmv'
  | 'frozen-col'
  | 'goods-name'
  | 'goods-id'
  | 'metric';

const tableCellClassNameByRole: Record<WeeklyTableCellRole, string> = {
  gmv: styles.goodsGmvCell,
  'frozen-col': styles.goodsFrozenCol,
  'goods-name': styles.goodsNameCell,
  'goods-id': styles.goodsIdCell,
  metric: styles.weeklyMetricBodyCell,
};

export function createWeeklyTableCellProps(
  ...roles: WeeklyTableCellRole[]
): WeeklyTableCellProps {
  return {
    className: mergeWeeklyClassNames(
      ...roles.map((role) => tableCellClassNameByRole[role])
    ),
  };
}

export function createWeeklyFrozenHeaderCellProps(): WeeklyTableCellProps {
  return {
    className: styles.goodsFrozenHead,
  };
}

export function createWeeklyMetricCellProps(): WeeklyTableCellProps {
  return createWeeklyTableCellProps('metric');
}
