import type { ReactNode } from 'react';
import {
  WeeklyKpiTrendRows,
  type WeeklyKpiTrendItem,
} from './weekly-kpi-trend-rows';
import { mergeWeeklyClassNames } from './weekly-class-names';
import styles from './weekly-modern.module.css';

export type { WeeklyKpiTrendItem } from './weekly-kpi-trend-rows';

export interface WeeklyKpiCardProps {
  label: ReactNode;
  value: ReactNode;
  trends: WeeklyKpiTrendItem[];
  variant?: 'default' | 'platform';
  className?: string;
  resolveTrendClassName: (value: number | undefined) => string;
}

const kpiCardVariantClassName: Record<
  NonNullable<WeeklyKpiCardProps['variant']>,
  string | undefined
> = {
  default: undefined,
  platform: styles.kpiCardPlatform,
};

export function WeeklyKpiCard({
  label,
  value,
  trends,
  variant = 'default',
  className,
  resolveTrendClassName,
}: WeeklyKpiCardProps) {
  const cardClassName = mergeWeeklyClassNames(
    styles.kpiCard,
    kpiCardVariantClassName[variant],
    className,
  );

  return (
    <article className={cardClassName}>
      <p className={styles.kpiLabel}>{label}</p>
      <strong className={styles.kpiValue}>{value}</strong>
      <WeeklyKpiTrendRows
        trends={trends}
        resolveTrendClassName={resolveTrendClassName}
      />
    </article>
  );
}
