import type { ReactNode } from 'react';
import {
  resolveWeeklyTrendClassName,
  type WeeklyTrendZeroMode,
} from './weekly-trend-style';

export interface WeeklyTrendTextProps {
  children: ReactNode;
  value: number | undefined;
  zeroMode?: WeeklyTrendZeroMode;
  className?: string;
}

export function WeeklyTrendText({
  children,
  value,
  zeroMode,
  className,
}: WeeklyTrendTextProps) {
  const trendClassName = resolveWeeklyTrendClassName(value, zeroMode);
  const resolvedClassName = className
    ? `${trendClassName} ${className}`
    : trendClassName;

  return <span className={resolvedClassName}>{children}</span>;
}
