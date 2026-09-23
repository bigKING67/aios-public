import type { ReactNode } from 'react';
import { mergeWeeklyClassNames } from './weekly-class-names';
import styles from './weekly-modern.module.css';

export interface WeeklyKpiGridProps {
  children: ReactNode;
  variant?: 'default' | 'platform';
  className?: string;
}

const kpiGridVariantClassName: Record<
  NonNullable<WeeklyKpiGridProps['variant']>,
  string | undefined
> = {
  default: undefined,
  platform: styles.kpiGridPlatform,
};

export function WeeklyKpiGrid({
  children,
  variant = 'default',
  className,
}: WeeklyKpiGridProps) {
  const gridClassName = mergeWeeklyClassNames(
    styles.kpiGrid,
    kpiGridVariantClassName[variant],
    className,
  );

  return <div className={gridClassName}>{children}</div>;
}
