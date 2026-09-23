import type { ReactNode } from 'react';
import { formatSignedPercent } from './platform-tab-formatters';
import styles from './weekly-modern.module.css';

export interface WeeklyKpiTrendItem {
  key?: string;
  label: ReactNode;
  value?: number;
  displayValue?: ReactNode;
}

export interface WeeklyKpiTrendRowsProps {
  trends: WeeklyKpiTrendItem[];
  resolveTrendClassName: (value: number | undefined) => string;
}

export function WeeklyKpiTrendRows({
  trends,
  resolveTrendClassName,
}: WeeklyKpiTrendRowsProps) {
  return (
    <>
      {trends.map((trend, index) => (
        <div key={trend.key ?? `${index}`} className={styles.kpiMetaRow}>
          <span className={resolveTrendClassName(trend.value)}>
            {trend.displayValue ?? formatSignedPercent(trend.value, 0)}
          </span>
          <span className={styles.kpiMetaLabel}>{trend.label}</span>
        </div>
      ))}
    </>
  );
}
